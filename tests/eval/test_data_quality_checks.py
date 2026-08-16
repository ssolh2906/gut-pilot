#!/usr/bin/env python3
"""
tests/eval/test_data_quality_checks.py -- runs the REAL, currently-live
ingestion code (app/server/compute/ingestion.py, the module main.py's
/api/session endpoint actually calls) against a small, deliberately
corrupted OTU table + metadata pair, to check whether two clear, common
real-world data problems actually get caught today.

This is a different kind of test from runner.py's manifest-driven checks:
those grade an agent's *output* against ground truth; this one exercises
actual ingestion functions against bad *input* and reports what really
happens right now.

History: this test originally targeted app/server/compute/p01_loading.py
and found real gaps there. That module is now dead code (superseded by
ingestion.py, confirmed via `grep -rn p01_loading app/` finding no live
imports) -- verified live via `curl -F count_table=@...` against a running
uvicorn instance on 2026-08-16 that ingestion.py actually does catch both
injected problems today (see the two PASS checks below). Kept as an
automated regression test so a future refactor can't silently reintroduce
either gap without this failing.

Fixtures (tests/eval/fixtures/data_quality/):
  otu_table.duplicate_id_and_noninteger.tsv - 5-genus, 5-sample RDP-style
    OTU table with two injected problems:
      1. DUPLICATE SAMPLE ID -- "2005650" appears twice in the raw header
         (positions 1 and 4). pandas' read_csv silently mangles the second
         occurrence to "2005650.1" before any of this project's code runs
         -- so it doesn't surface as an explicit "duplicate ID" hard-stop,
         it surfaces as "2005650.1 has no metadata match" instead. Still a
         HARD_STOP either way, which is what actually matters: the upload
         is rejected, not silently accepted with corrupted sample identity.
      2. NON-INTEGER COUNT -- Faecalibacterium x "2003650" = 12.5 instead
         of a whole read count (e.g. an accidentally-already-normalized
         table). Caught directly and explicitly by validate_counts().
  metadata.duplicate_id_and_noninteger.txt - matching 4-row metadata (real
    patient count; the OTU table's 5th column is the duplicate-ID artifact).

Usage:
    python tests/eval/test_data_quality_checks.py
Exit code 0 if the pipeline's parse_report correctly HARD_STOPs with both
expected reasons; 1 otherwise.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "data_quality"
OTU_TABLE = FIXTURE_DIR / "otu_table.duplicate_id_and_noninteger.tsv"
METADATA = FIXTURE_DIR / "metadata.duplicate_id_and_noninteger.txt"

sys.path.insert(0, str(REPO_ROOT / "app" / "server"))
from compute.ingestion import _load_from_layout  # noqa: E402


class Check:
    def __init__(self, name, passed, detail):
        self.name = name
        self.passed = passed
        self.detail = detail


def run():
    results = []
    ingestion_result = _load_from_layout(OTU_TABLE, METADATA)
    pr = ingestion_result.parse_report

    results.append(Check(
        "pipeline HARD_STOPs on this input at all",
        pr["status"] == "HARD_STOP",
        f"status={pr['status']!r}, hard_stops={pr['hard_stops']}",
    ))

    results.append(Check(
        "Problem 2 (non-integer count, Faecalibacterium x 2003650 = 12.5) is caught",
        "count table contains non-integer values" in pr["hard_stops"],
        f"hard_stops={pr['hard_stops']}",
    ))

    unmatched = pr["metadata"]["unmatched_count_table_ids"]
    results.append(Check(
        "Problem 1 (duplicate sample ID, mangled to '2005650.1') surfaces as an unmatched-ID hard-stop",
        unmatched == ["2005650.1"],
        f"unmatched_count_table_ids={unmatched} (pandas renamed the true duplicate '2005650' to "
        f"'2005650.1' during read_csv before this code ever ran; it shows up here as a metadata "
        f"mismatch rather than an explicit duplicate-ID message, but it does still block the upload)",
    ))

    results.append(Check(
        "n_samples reflects all 5 raw columns (mangled duplicate not silently dropped)",
        ingestion_result.raw_counts.shape[1] == 5,
        f"raw_counts.shape={ingestion_result.raw_counts.shape}",
    ))

    return results


def main():
    results = run()
    print("=" * 78)
    print("DATA QUALITY INJECTION TEST -- duplicate sample ID + non-integer count")
    print("=" * 78)
    for r in results:
        marker = "PASS" if r.passed else "FAIL"
        print(f"  [{marker}] {r.name}\n         {r.detail}")

    print("-" * 78)
    if all(r.passed for r in results):
        print("Both injected problems are caught by the live ingestion pipeline (HARD_STOP).")
    else:
        print("REGRESSION: at least one previously-verified check no longer passes -- "
              "see FAILs above before treating current ingestion.py as safe.")
    print("-" * 78)

    sys.exit(0 if all(r.passed for r in results) else 1)


if __name__ == "__main__":
    main()
