"""Beta diversity: Bray-Curtis distance and PCoA ordination."""

import numpy as np
import pandas as pd
from scipy.spatial.distance import braycurtis, euclidean, jaccard
from skbio import DistanceMatrix
from skbio.stats.distance import permanova
from skbio.stats.ordination import pcoa

from .p04_normalization import clr_transform


def relative_abundance(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize each sample (column) to sum to 1. Input: count df. Output: proportions df."""
    return df.div(df.sum(axis=0), axis=1)


def bray_curtis_matrix(rel_abundance: pd.DataFrame) -> pd.DataFrame:
    """Pairwise Bray-Curtis distance between samples.

    Input: relative-abundance DataFrame (index=taxon, columns=sample)
    Output: symmetric distance DataFrame (index=columns=sample_id, diagonal 0)
    """
    samples = rel_abundance.columns.tolist()
    values = rel_abundance.T.values
    n = len(samples)
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d = braycurtis(values[i], values[j])
            dist[i, j] = d
            dist[j, i] = d
    return pd.DataFrame(dist, index=samples, columns=samples)


def pcoa_ordination(dist_df: pd.DataFrame) -> dict:
    """Principal coordinates analysis on a distance matrix.

    Input: symmetric distance DataFrame (index=columns=sample_id)
    Output: {"coords": DataFrame indexed by sample_id with PC1, PC2, ...,
             "proportion_explained": Series indexed by PC name}
    """
    dm = DistanceMatrix(dist_df.values, ids=dist_df.index.tolist())
    result = pcoa(dm)
    return {
        "coords": result.samples,
        "proportion_explained": result.proportion_explained,
    }


# ---- STUB below: no source notebook, not implemented (G9). Fake data, same
# shape as the real thing, so the API/frontend can integrate against it now. ----


def _fake_symmetric_matrix(samples: list[str], seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    n = len(samples)
    m = rng.uniform(0, 1, size=(n, n))
    m = (m + m.T) / 2
    np.fill_diagonal(m, 0)
    return pd.DataFrame(m, index=samples, columns=samples)


def jaccard_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Jaccard distance (presence/absence only, ignores abundance).

    Input: count df (index=taxon, columns=sample)
    Output: symmetric distance DataFrame (index=columns=sample_id, diagonal 0)
    """
    samples = df.columns.tolist()
    presence = df.T.values > 0
    n = len(samples)
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d = jaccard(presence[i], presence[j])
            dist[i, j] = d
            dist[j, i] = d
    return pd.DataFrame(dist, index=samples, columns=samples)


def aitchison_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Aitchison distance: euclidean distance on CLR-transformed values.
    Only meaningful when G6 normalization = CLR, not on rarefied counts.

    Input: count df (index=taxon, columns=sample)
    Output: symmetric distance DataFrame (index=columns=sample_id, diagonal 0)
    """
    clr_df = clr_transform(df)
    samples = clr_df.columns.tolist()
    values = clr_df.T.values
    n = len(samples)
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d = euclidean(values[i], values[j])
            dist[i, j] = d
            dist[j, i] = d
    return pd.DataFrame(dist, index=samples, columns=samples)


def unifrac_matrix(df: pd.DataFrame, tree) -> pd.DataFrame:
    """Phylogenetic UniFrac distance. Input: count df, phylogenetic tree. Output: symmetric distance df (fake)."""
    # TODO: skbio.diversity.beta_diversity(metric="unweighted_unifrac", tree=tree, ...).
    # No phylogenetic tree is available for this dataset yet.
    return _fake_symmetric_matrix(df.columns.tolist(), seed=4)


def run_permanova(dist_df: pd.DataFrame, grouping: list[str]) -> dict:
    """PERMANOVA test on a distance matrix against a grouping (Anderson 2001).
    r2 is derived from skbio's pseudo-F statistic via the standard ANOVA identity
    R2 = (F*(a-1)) / (F*(a-1) + (n-a)), since skbio doesn't report R2 directly.

    Input: symmetric distance df, per-sample group labels (same order as dist_df.index)
    Output: {"r2", "p", "permutations", "dispersion", "dispersion_p"}
    (dispersion/dispersion_p are still fake — no PERMDISP/betadisper in skbio)
    """
    dm = DistanceMatrix(dist_df.values, ids=dist_df.index.tolist())
    result = permanova(dm, grouping, permutations=999)
    f_stat = result["test statistic"]
    n = result["sample size"]
    a = result["number of groups"]
    r2 = (f_stat * (a - 1)) / (f_stat * (a - 1) + (n - a))

    # TODO: dispersion/dispersion_p (PERMDISP) — no skbio implementation; would need a
    # manual distance-to-centroid permutation test.
    rng = np.random.default_rng(5)
    return {
        "r2": float(r2),
        "p": float(result["p-value"]),
        "permutations": int(result["number of permutations"]),
        "dispersion": float(rng.uniform(0.2, 0.6)),
        "dispersion_p": float(rng.uniform(0.1, 0.5)),
    }
