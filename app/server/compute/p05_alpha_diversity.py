"""Alpha diversity metrics, averaged over repeated rarefaction."""

import numpy as np
import pandas as pd
from scipy.stats import entropy, mannwhitneyu

from .p04_rarefaction import rarefy_once


def observed_taxa(counts: np.ndarray) -> int:
    """Count taxa with at least one read. Input: counts array. Output: taxon count."""
    return int((counts > 0).sum())


def shannon(counts: np.ndarray) -> float:
    """Shannon entropy (base 2). Input: counts array. Output: entropy in bits."""
    counts = counts[counts > 0]
    props = counts / counts.sum()
    return float(entropy(props, base=2))


def simpson(counts: np.ndarray) -> float:
    """Simpson diversity index (1 - D). Input: counts array. Output: index in [0, 1]."""
    counts = counts[counts > 0]
    n = counts.sum()
    return 1.0 - np.sum(counts * (counts - 1)) / (n * (n - 1))


def chao1(counts: np.ndarray) -> float:
    """Chao1 richness estimator. Input: counts array. Output: estimated richness."""
    obs = (counts > 0).sum()
    f1 = (counts == 1).sum()
    f2 = (counts == 2).sum()
    if f2 == 0:
        return float(obs + f1 * (f1 - 1) / 2)
    return float(obs + (f1**2) / (2 * f2))


def pielou_evenness(counts: np.ndarray) -> float:
    """Pielou's evenness (Shannon / log2 richness). Input: counts array. Output: value in [0, 1]."""
    s = observed_taxa(counts)
    if s <= 1:
        return 0.0
    return shannon(counts) / np.log2(s)


def compute_alpha_diversity(
    df: pd.DataFrame, depth: int, n_iterations: int, rng: np.random.Generator
) -> pd.DataFrame:
    """Average five alpha diversity metrics over repeated rarefactions, per sample.

    Input: count DataFrame (index=taxon, columns=sample), rarefaction depth,
    number of rarefaction iterations to average, numpy Generator
    Output: DataFrame indexed by metric name, columns=sample, values=mean across iterations
    (NaN for samples whose total reads are below depth)
    """
    metrics = {
        "Observed_taxa": observed_taxa,
        "Shannon": shannon,
        "Simpson": simpson,
        "Chao1": chao1,
        "Pielou_evenness": pielou_evenness,
    }
    results: dict[str, dict[str, float]] = {m: {} for m in metrics}

    for sample in df.columns:
        counts = df[sample].values
        if counts.sum() < depth:
            for m in metrics:
                results[m][sample] = np.nan
            continue

        per_iter: dict[str, list[float]] = {m: [] for m in metrics}
        for _ in range(n_iterations):
            r = rarefy_once(counts, depth, rng)
            if r is None:
                continue
            for m, fn in metrics.items():
                per_iter[m].append(fn(r))

        for m in metrics:
            results[m][sample] = np.mean(per_iter[m]) if per_iter[m] else np.nan

    return pd.DataFrame(results).T


def alpha_group_test(values_by_group: dict[str, list[float]]) -> dict:
    """Two-group significance test for one alpha diversity metric (G8).

    Input: {group_label: [values, ...]} — exactly two groups
    Output: {"p_value": float, "test": "mannwhitneyu"}
    """
    groups = list(values_by_group.values())
    _, p = mannwhitneyu(groups[0], groups[1])
    return {"p_value": float(p), "test": "mannwhitneyu"}
