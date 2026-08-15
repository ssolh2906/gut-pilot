"""Rarefaction (subsampling) helpers used by alpha diversity and QC/normalize compute."""

import numpy as np


def rarefy_once(counts: np.ndarray, depth: int, rng: np.random.Generator) -> np.ndarray | None:
    """Subsample a sample's counts to `depth` reads without replacement.

    Input: counts (per-taxon read counts), target depth, numpy Generator
    Output: subsampled counts array (same length as input), or None if total < depth
    """
    total = counts.sum()
    if total < depth:
        return None
    expanded = np.repeat(np.arange(len(counts)), counts.astype(int))
    chosen = rng.choice(expanded, size=depth, replace=False)
    return np.bincount(chosen, minlength=len(counts))


def build_rarefaction_curve(
    counts: np.ndarray, steps: np.ndarray, n_iter: int, rng: np.random.Generator
) -> dict[int, float]:
    """Compute a rarefaction curve: mean observed-taxa count at each depth step.

    Input: counts (per-taxon read counts), depth steps to evaluate, iterations per
    step to average over, numpy Generator
    Output: {depth: mean observed taxa}, steps where every iteration fails are omitted
    """
    curve: dict[int, float] = {}
    for depth in steps:
        depth = int(depth)
        observed = []
        for _ in range(n_iter):
            r = rarefy_once(counts, depth, rng)
            if r is not None:
                observed.append(int((r > 0).sum()))
        if observed:
            curve[depth] = float(np.mean(observed))
    return curve
