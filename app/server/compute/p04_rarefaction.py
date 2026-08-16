"""Rarefaction (subsampling) helpers used by alpha diversity and QC/normalize compute."""

import numpy as np
import pandas as pd
from scipy.special import gammaln


def expected_richness(counts: np.ndarray, depth: int) -> float:
    """Exact expected number of observed taxa at subsample size `depth`
    (Hurlbert 1971's rarefaction formula, the same closed form vegan::rarefy
    and QIIME use) rather than Monte Carlo subsampling: for each taxon i
    with N_i reads out of N total, the probability it is ABSENT from a
    depth-sized draw without replacement is C(N-N_i, depth) / C(N, depth);
    summing 1 minus that over taxa gives the expected richness. Computed in
    log-space via gammaln for numerical stability at real read depths, and
    vectorized over taxa so it's cheap enough to call per sample per curve
    point for an entire cohort (unlike repeated-subsampling Monte Carlo).

    Input: counts (per-taxon read counts for one sample), target depth
    Output: expected number of taxa observed at that depth (float, 0 if
    depth <= 0, exact observed richness if depth >= total reads)
    """
    total = counts.sum()
    if depth <= 0:
        return 0.0
    if depth >= total:
        return float((counts > 0).sum())
    ni = counts[counts > 0]
    valid = (total - ni) >= depth
    log_p_absent = np.full(ni.shape, -np.inf)
    niv = ni[valid]
    log_p_absent[valid] = (
        gammaln(total - niv + 1) - gammaln(depth + 1) - gammaln(total - niv - depth + 1)
    ) - (gammaln(total + 1) - gammaln(depth + 1) - gammaln(total - depth + 1))
    p_absent = np.exp(log_p_absent)
    return float((1 - p_absent).sum())


def expected_richness_curve(counts: np.ndarray, depths: np.ndarray) -> list[float]:
    """`expected_richness` evaluated at each of a sample's curve points.

    Input: counts (per-taxon read counts), depths to evaluate (ints)
    Output: list of expected-richness floats, same length/order as depths
    """
    return [expected_richness(counts, int(d)) for d in depths]


def suggest_plateau_depth(
    count_table: pd.DataFrame, grid: np.ndarray | None = None, step: int = 500, rel_gain_floor: float = 0.03
) -> int:
    """Real curve-plateau-derived rarefaction depth (G7 default), replacing
    a hardcoded threshold: the smallest depth at which the MEDIAN relative
    marginal richness gain (across every sample whose curve is still
    defined at depth+step) has dropped to rel_gain_floor or below — i.e.
    where most samples' rarefaction curves have practically flattened.

    Input: count df (index=taxon, columns=sample), candidate depth grid to
    scan (default 500..14750 step 250), step used to measure the marginal
    gain, relative-gain floor that counts as "plateaued"
    Output: suggested depth (int) — falls back to the largest grid point
    scanned if the cohort's curves never plateau within it
    """
    if grid is None:
        grid = np.arange(500, 15000, 250)
    arrays = [count_table[col].to_numpy() for col in count_table.columns]
    for d in grid:
        d = int(d)
        gains = []
        for counts in arrays:
            total = counts.sum()
            if total < d + step:
                continue
            r0 = expected_richness(counts, d)
            r1 = expected_richness(counts, d + step)
            gains.append((r1 - r0) / max(r0, 1e-9))
        if gains and float(np.median(gains)) <= rel_gain_floor:
            return d
    return int(grid[-1])


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


def samples_above_depth(depths: dict[str, int], threshold: int) -> dict:
    """Split samples into retained/excluded by a depth threshold (G7).

    Input: {sample_id: depth}, threshold
    Output: {"retained": [sample_id, ...], "excluded": [sample_id, ...]}
    """
    retained = [s for s, d in depths.items() if d >= threshold]
    excluded = [s for s, d in depths.items() if d < threshold]
    return {"retained": retained, "excluded": excluded}
