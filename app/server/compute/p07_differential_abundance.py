"""Differential abundance testing and literature cross-check (G10)."""

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu

from .p04_normalization import clr_transform
from .p05_stats_utils import multiple_testing_correction
from .p07_artifact_checks import check_single_sample_driven

# The four prevalence presets research/07_differential_abundance.md and
# docs/gates/G10.md both fix as the offered options (no filter / permissive /
# recommended / strict).
PREVALENCE_PRESETS = [0.0, 0.05, 0.10, 0.20]


def run_differential_abundance(
    df: pd.DataFrame, grouping: list[str], labels: tuple[str, str] | None = None, correction: str = "bh"
) -> pd.DataFrame:
    """Per-taxon differential abundance between exactly two groups, via CLR + Wilcoxon
    rank-sum — a simplified version of ALDEx2 (Fernandes et al. 2014, Microbiome,
    PMID 24910773, doi:10.1186/2049-2618-2-15) without its Monte-Carlo resampling.
    ANCOM-BC2/full ALDEx2 are the literature's preferred primary methods but both are
    R-only; this is the "transparent non-parametric sensitivity analysis" that
    research/07_differential_abundance.md accepts as a standalone, clearly-labeled method.

    Input: count df (index=taxon, columns=sample), per-sample group labels (exactly
    two distinct labels, same order as df.columns), explicit (label_a, label_b) order
    (None = whichever order the labels first appear in `grouping`, which is fragile
    against upstream column reordering — callers that care which label is "up" should
    always pass this explicitly), FDR method for q ("bh"|"bonferroni"|"none")
    Output: DataFrame indexed by taxon with columns:
      lfc         log2 fold change = (mean CLR in group B - mean CLR in group A) / ln(2),
                  i.e. ALDEx2's signed CLR difference ("diff.btw") rescaled to log2
      p           raw Wilcoxon rank-sum p-value
      q           FDR-adjusted p-value across all taxa tested
      dir         "up" (enriched in group B) | "down" (enriched in group A) | "ns"
      prevalence  fraction of samples with count > 0
    """
    clr_df = clr_transform(df)
    groups = pd.Series(grouping, index=df.columns)
    resolved_labels = tuple(labels) if labels is not None else tuple(groups.unique())
    if len(resolved_labels) != 2:
        raise ValueError("run_differential_abundance expects exactly two groups")
    cols_a, cols_b = groups[groups == resolved_labels[0]].index, groups[groups == resolved_labels[1]].index

    lfc, p = [], []
    for taxon in clr_df.index:
        x, y = clr_df.loc[taxon, cols_a].values, clr_df.loc[taxon, cols_b].values
        taxon_lfc = (y.mean() - x.mean()) / np.log(2)
        lfc.append(0.0 if np.isnan(taxon_lfc) else taxon_lfc)
        # mannwhitneyu raises on some degenerate inputs (every value in both
        # groups identical, e.g. a taxon at the same CLR floor everywhere)
        # but silently returns a NaN p-value on others (heavy ties at a
        # coarser rank, e.g. phylum, with far fewer/larger-count features) -
        # both fall back to p=1.0 (no evidence of a difference) rather than
        # propagating an error or a NaN that json.dumps can't serialize.
        try:
            taxon_p = mannwhitneyu(x, y).pvalue
        except ValueError:
            taxon_p = 1.0
        p.append(1.0 if np.isnan(taxon_p) else taxon_p)

    lfc = np.array(lfc)
    return pd.DataFrame(
        {
            "lfc": lfc,
            "p": p,
            "q": multiple_testing_correction(p, correction, len(p)),
            "dir": np.where(lfc > 0, "up", np.where(lfc < 0, "down", "ns")),
            "prevalence": (df > 0).mean(axis=1).values,
        },
        index=df.index,
    )


def filter_by_prevalence(df: pd.DataFrame, threshold: float) -> pd.DataFrame:
    """Drop taxa present (count > 0) in fewer than `threshold` of samples (G10).

    Input: count df (index=taxon, columns=sample), prevalence threshold in [0, 1]
    Output: df restricted to rows meeting the threshold, same columns
    """
    prevalence = (df > 0).mean(axis=1)
    # .copy() matters here, not just style: FastAPI runs each sync request
    # handler in its own threadpool thread, and every DA request reads the
    # same session.count_table concurrently (rapid prevalence-threshold
    # clicks fire overlapping requests) - a bare .loc[] slice can share the
    # parent DataFrame's underlying buffer, so a downstream in-place op in
    # one thread's request can corrupt another's. Reproduced directly by
    # firing overlapping requests: some resulting q-values came back NaN
    # (which json.dumps then rejects), even though every single-request
    # path is correct in isolation.
    return df.loc[prevalence >= threshold].copy()


def n_tested_by_preset(df: pd.DataFrame) -> dict[str, int]:
    """Feature count remaining at each of the four standard prevalence presets,
    for the gate's "n_tested on every option, not just the selected one" requirement.

    Input: unfiltered count df (index=taxon, columns=sample)
    Output: {str(threshold): n_taxa_remaining} for each of PREVALENCE_PRESETS
    """
    prevalence = (df > 0).mean(axis=1)
    return {str(t): int((prevalence >= t).sum()) for t in PREVALENCE_PRESETS}


def known_taxa_crosscheck(
    tested_results: pd.DataFrame, all_genera: set[str], known_taxa: pd.DataFrame, alpha: float = 0.05
) -> list[dict]:
    """Cross-reference this run's DA results against a curated literature table.

    Input: tested_results (post prevalence-filter da results, with a real-label
    "direction" column - see build_da_result), all_genera (every taxon present in
    the UNFILTERED count table, to distinguish "the prevalence filter dropped it"
    from "never detected at all"), known_taxa DataFrame (taxon_genus,
    literature_direction, citation_key, note - see
    research/fixtures/known_taxa_crc.csv), significance threshold
    Output: list of dicts (taxon_genus, literature_direction, this_run_direction,
    q, status, citation_key, note) - deliberately NOT a DataFrame: a "q" column
    mixing real floats with a Python None (for the not-tested statuses below)
    silently upcasts every None to NaN the moment it touches a pandas float
    column, and NaN isn't valid JSON (Starlette's response encoder rejects it,
    unlike a bare None which serializes to null) - a real, previously-reproduced
    500 on this exact endpoint. status is one of: "confirmed" (significant,
    direction matches literature), "discordant" (significant, opposite
    direction), "not_significant" (tested but q >= alpha), "dropped_by_filter"
    (present in the raw table but removed by the current prevalence threshold),
    "not_detected" (absent from the raw table entirely)
    """
    rows = []
    tested_genera = set(tested_results.index)
    for _, row in known_taxa.iterrows():
        genus = row["taxon_genus"]
        lit_dir = row["literature_direction"]
        this_dir, q = None, None
        if genus in tested_genera:
            q = float(tested_results.loc[genus, "q"])
            this_dir = tested_results.loc[genus, "direction"]
            if q < alpha and this_dir == lit_dir:
                status = "confirmed"
            elif q < alpha:
                status = "discordant"
            else:
                status = "not_significant"
        elif genus in all_genera:
            status = "dropped_by_filter"
        else:
            status = "not_detected"
        rows.append({
            "taxon_genus": genus, "literature_direction": lit_dir, "this_run_direction": this_dir,
            "q": q, "status": status, "citation_key": row["citation_key"], "note": row["note"],
        })
    return rows


def build_da_result(
    df: pd.DataFrame,
    grouping: list[str],
    labels: tuple[str, str],
    threshold: float,
    correction: str,
    alpha: float,
    known_taxa: pd.DataFrame,
    single_sample_flag_threshold: float = 0.9,
) -> dict:
    """Assemble everything the Differential Abundance page needs from one
    real, freshly-computed run: the prevalence-filtered DA table (with real
    group-name directions, not "up"/"down"), the literature cross-check, and
    an artifact/fragility scan restricted to the leading (significant) hits
    (per research/07_differential_abundance.md #9 - never scan every taxon,
    only the ones that would enter the biological narrative).

    Input: raw (unfiltered) count df, per-sample group labels aligned to
    df.columns, explicit (label_a, label_b) - label_b is "enriched", prevalence
    threshold, FDR method, significance alpha, known-taxa literature table
    Output: {
      "n_total": int, "n_tested": int, "prevalence_options": {threshold: n_tested},
      "labels": [label_a, label_b],
      "genera": {taxon: {lfc, p, q, direction, prevalence, prevalence_a,
                 prevalence_b, significant, artifact}},
      "n_significant": int,
      "known_taxa": [{taxon_genus, literature_direction, this_run_direction,
                      q, status, citation_key, note}],
      "dropped_named_taxa": [taxon, ...],  # known taxa removed by this threshold
    }
    """
    all_genera = set(df.index)
    filtered = filter_by_prevalence(df, threshold)
    res = run_differential_abundance(filtered, grouping, labels=labels, correction=correction)

    dir_to_label = {"up": labels[1], "down": labels[0], "ns": None}
    res["direction"] = res["dir"].map(dir_to_label)
    res["significant"] = res["q"] < alpha

    groups = pd.Series(grouping, index=df.columns)
    cols_a = groups[groups == labels[0]].index
    cols_b = groups[groups == labels[1]].index
    prevalence_a = (filtered[cols_a] > 0).mean(axis=1)
    prevalence_b = (filtered[cols_b] > 0).mean(axis=1)

    genera = {}
    for taxon in res.index:
        row = res.loc[taxon]
        artifact = None
        if row["significant"]:
            check = check_single_sample_driven(df.loc[taxon].to_dict(), single_sample_flag_threshold)
            if check["flagged"]:
                artifact = {"type": "single_sample_driven", "sample_id": check["sample_id"], "fraction": check["fraction"]}
        genera[taxon] = {
            "lfc": float(row["lfc"]), "p": float(row["p"]), "q": float(row["q"]),
            "direction": row["direction"], "prevalence": float(row["prevalence"]),
            "prevalence_a": float(prevalence_a[taxon]), "prevalence_b": float(prevalence_b[taxon]),
            "significant": bool(row["significant"]), "artifact": artifact,
        }

    known = known_taxa_crosscheck(res, all_genera, known_taxa, alpha)
    dropped_named = [row["taxon_genus"] for row in known if row["status"] == "dropped_by_filter"]

    return {
        "n_total": len(all_genera),
        "n_tested": len(res),
        "prevalence_options": n_tested_by_preset(df),
        "labels": list(labels),
        "genera": genera,
        "n_significant": int(res["significant"].sum()),
        "known_taxa": known,
        "dropped_named_taxa": dropped_named,
    }
