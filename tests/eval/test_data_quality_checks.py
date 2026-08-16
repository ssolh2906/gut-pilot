#!/usr/bin/env python3
"""
tests/eval/test_data_quality_checks.py -- runs the REAL ingestion code in
app/server/compute/ against a small, deliberately corrupted OTU table to
check whether two clear, common real-world data problems actually get
caught today, not just whether a hand-authored RUN.json says they should be.

This is a different kind of test from runner.py's manifest-driven checks:
those grade an agent's *output* against ground truth; this one exercises
actual ingestion functions against bad *input* and reports what really
happens right now -- including gaps, not just passes.

Fixture: tests/eval/fixtures/data_quality/otu_table.duplicate_id_and_noninteger.tsv
Two problems injected into an otherwise realistic 5-genus, 5-sample RDP-style
OTU table:
  1. DUPLICATE SAMPLE ID -- column header "2005650" appears twice in the raw
     file (positions 1 and 4). A common real-world bug: two sequencing runs'
     outputs concatenated without deduplicating overlapping re-sequenced
     samples.
  2. NON-INTEGER COUNT -- row 3 (Faecalibacterium), column "2003650" holds
     12.5 instead of a whole read count. A common real-world bug: someone
     accidentally handed the pipeline a relative-abundance or
     already-CSS-normalized table instead of raw counts.

Running this the first time surfaced a THIRD thing worth knowing, more
interesting than either injected problem: pandas' read_csv silently mangles
duplicate column headers into "2005650" / "2005650.1" *before* any of this
project's own code runs. So the raw file genuinely has the duplicate, but
find_duplicate_sample_ids() only finds it if given the raw header (read
before pandas touches it) -- if it's ever called on an already-loaded
DataFrame's .columns instead, the duplicate is already invisible, silently.
That distinction is the main thing this test checks for Problem 1.

Usage:
    python tests/eval/test_data_quality_checks.py
Exit code 0 if every check that *should* catch a problem does; 1 otherwise.
Also prints, explicitly, any problem that exists in the data but is not
caught anywhere in the current pipeline -- that's a real gap, not a bug in
this test.
"""
import csv
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "data_quality" / "otu_table.duplicate_id_and_noninteger.tsv"

sys.path.insert(0, str(REPO_ROOT / "app" / "server"))
import pandas as pd  # noqa: E402
from compute.p01_loading import load_count_table  # noqa: E402
from compute.p03_qc_checks import check_non_negative_integers, find_duplicate_sample_ids  # noqa: E402

DUPLICATE_SAMPLE_ID = "2005650"
NON_INTEGER_CELL = ("k__Bacteria;p__Firmicutes;c__Clostridia;o__Clostridiales;"
                     "f__Ruminococcaceae;g__Faecalibacterium;s__;d__denovo3", "2003650")


class Check:
    def __init__(self, name, passed, detail, is_gap_check=False):
        self.name = name
        self.passed = passed
        self.detail = detail
        self.is_gap_check = is_gap_check


def read_raw_header(path):
    with open(path) as f:
        return next(csv.reader(f, delimiter="\t"))[1:]  # drop the leading blank taxonomy-column header


def run():
    results = []

    raw_header = read_raw_header(FIXTURE)
    raw_df = pd.read_csv(FIXTURE, sep="\t", index_col=0)  # what pandas actually hands the rest of the code

    # ---- Problem 1: duplicate sample ID ------------------------------------
    results.append(Check(
        "fixture's true raw header contains the duplicate-ID problem",
        raw_header.count(DUPLICATE_SAMPLE_ID) == 2,
        f"raw header (pre-pandas): {raw_header}",
    ))

    dupes_on_raw_header = find_duplicate_sample_ids(raw_header)
    results.append(Check(
        "p03_qc_checks.find_duplicate_sample_ids() catches it, IF given the raw header",
        dupes_on_raw_header == [DUPLICATE_SAMPLE_ID],
        f"find_duplicate_sample_ids(raw_header) returned {dupes_on_raw_header}",
    ))

    dupes_on_loaded_columns = find_duplicate_sample_ids(raw_df.columns.tolist())
    results.append(Check(
        "GAP CHECK: does the same function still catch it if called on the already-pandas-parsed columns instead?",
        dupes_on_loaded_columns == [DUPLICATE_SAMPLE_ID],
        f"pandas silently renamed the columns to {raw_df.columns.tolist()} during read_csv -- "
        f"the exact duplicate is gone before any of this project's code runs, so "
        f"find_duplicate_sample_ids(df.columns) returns {dupes_on_loaded_columns}, missing it entirely. "
        f"The check is correct; where it's called from matters. It must run against the raw file "
        f"header (e.g. via csv.reader, as this test does) BEFORE pd.read_csv, not after.",
        is_gap_check=True,
    ))

    loaded = load_count_table(str(FIXTURE))
    results.append(Check(
        "GAP CHECK: does load_count_table() itself warn about the mangled '.1'-suffixed sample ID?",
        False,  # it doesn't -- no such check exists in load_count_table today
        f"load_count_table() output columns: {loaded.columns.tolist()} -- '2005650.1' silently exists "
        f"as a distinct sample now. Downstream, this ID won't match anything in metadata.txt (which only "
        f"has '2005650'), so that sample will fail to join later -- but it'll look like ordinary sample "
        f"attrition, not a data-corruption symptom, unless something flags '.N'-suffixed IDs specifically.",
        is_gap_check=True,
    ))

    # ---- Problem 2: non-integer count --------------------------------------
    genus, sample = NON_INTEGER_CELL
    raw_cell_value = raw_df.loc[genus, sample]
    cell_is_non_integer = float(raw_cell_value) != int(raw_cell_value)
    results.append(Check(
        "fixture actually contains the non-integer-count problem",
        cell_is_non_integer,
        f"{genus_short(genus)} x {sample} = {raw_cell_value}",
    ))

    all_ints = check_non_negative_integers(raw_df)
    results.append(Check(
        "p03_qc_checks.check_non_negative_integers() catches it",
        all_ints is False,
        f"returned {all_ints} (expected False)",
    ))

    loaded_cell = loaded.loc["Faecalibacterium", sample] if "Faecalibacterium" in loaded.index else None
    non_integer_survives_loading = loaded_cell is not None and float(loaded_cell) != int(loaded_cell)
    results.append(Check(
        "GAP CHECK: does load_count_table() itself reject/flag the non-integer value?",
        not non_integer_survives_loading,
        f"load_count_table() output has Faecalibacterium x {sample} = {loaded_cell} -- "
        f"loaded and genus-summed with no type check, no error, no warning. A pre-normalized "
        f"or relative-abundance table fed in by mistake would pass through completely silently.",
        is_gap_check=True,
    ))

    return results


def genus_short(taxonomy):
    return taxonomy.split(";")[-3].replace("g__", "")


def main():
    results = run()
    print("=" * 78)
    print("DATA QUALITY INJECTION TEST -- duplicate sample ID + non-integer count")
    print("=" * 78)
    for r in results:
        marker = "PASS" if r.passed else "FAIL"
        print(f"  [{marker}] {r.name}\n         {r.detail}")

    gaps = [r for r in results if r.is_gap_check and not r.passed]
    print("\n" + "-" * 78)
    if gaps:
        print(f"{len(gaps)} real gap(s) found in the CURRENT pipeline (not this test's fault):")
        for g in gaps:
            print(f"  - {g.name}")
        print(
            "\nBoth detector functions (find_duplicate_sample_ids, check_non_negative_integers) "
            "already exist in app/server/compute/p03_qc_checks.py and work correctly when given "
            "the right input. Neither is currently invoked anywhere in the ingestion path, and "
            "find_duplicate_sample_ids specifically must run on the RAW file header (before "
            "pd.read_csv mangles duplicates away), not on a DataFrame's .columns after loading. "
            "Concrete fix: read the raw header once for duplicate-checking purposes, call both "
            "checks right after, and surface the results in the ingestion section of RUN.json "
            "before the table reaches any later pipeline stage."
        )
    else:
        print("No gaps -- every injected problem is caught somewhere in the current pipeline.")
    print("-" * 78)

    hard_fail = any(not r.passed for r in results if not r.is_gap_check)
    sys.exit(1 if hard_fail else 0)


if __name__ == "__main__":
    main()
