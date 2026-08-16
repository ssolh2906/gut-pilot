"""Artifact/pitfall warnings shown on the Differential Abundance page (P1/P4/P9)."""

import pandas as pd


def check_single_sample_driven(taxon_counts_by_sample: dict[str, float], threshold: float) -> dict:
    """Flag when one sample accounts for most of a taxon's total abundance (P4).

    Input: {sample_id: count} for one taxon, threshold fraction (e.g. 0.9)
    Output: {"flagged": bool, "sample_id": str|None, "fraction": float}
    """
    total = sum(taxon_counts_by_sample.values())
    if total == 0:
        return {"flagged": False, "sample_id": None, "fraction": 0.0}
    top_sample = max(taxon_counts_by_sample, key=taxon_counts_by_sample.get)
    fraction = taxon_counts_by_sample[top_sample] / total
    return {"flagged": fraction >= threshold, "sample_id": top_sample, "fraction": float(fraction)}


def check_normalization_metric_mismatch(norm_strategy: str, beta_metric: str) -> bool:
    """Flag when the beta metric doesn't match the normalization transform (P9).

    Input: G6 normalization strategy ("rarefy"|"css"|"clr"), G9 beta metric
    ("bray"|"jaccard"|"aitchison"|"unifrac")
    Output: True if CLR is chosen but the metric isn't Aitchison
    """
    return norm_strategy == "clr" and beta_metric != "aitchison"
