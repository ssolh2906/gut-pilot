"""Beta diversity: Bray-Curtis distance and PCoA ordination."""

import numpy as np
import pandas as pd
from scipy.spatial.distance import braycurtis
from skbio import DistanceMatrix
from skbio.stats.ordination import pcoa


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
    """Jaccard distance (presence/absence). Input: count df. Output: symmetric distance df (fake)."""
    # TODO: scipy.spatial.distance.jaccard, or skbio.diversity.beta_diversity(metric="jaccard").
    return _fake_symmetric_matrix(df.columns.tolist(), seed=2)


def aitchison_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Aitchison distance (log-ratio geometry). Input: count df. Output: symmetric distance df (fake)."""
    # TODO: no direct library function — euclidean distance on normalization.clr_transform(df) output.
    # Only meaningful when G6 normalization = CLR, not on rarefied counts.
    return _fake_symmetric_matrix(df.columns.tolist(), seed=3)


def unifrac_matrix(df: pd.DataFrame, tree) -> pd.DataFrame:
    """Phylogenetic UniFrac distance. Input: count df, phylogenetic tree. Output: symmetric distance df (fake)."""
    # TODO: skbio.diversity.beta_diversity(metric="unweighted_unifrac", tree=tree, ...).
    # No phylogenetic tree is available for this dataset yet.
    return _fake_symmetric_matrix(df.columns.tolist(), seed=4)


def run_permanova(dist_df: pd.DataFrame, grouping: list[str]) -> dict:
    """PERMANOVA test on a distance matrix against a grouping.

    Input: symmetric distance df, per-sample group labels (same order as dist_df.index)
    Output: {"r2", "p", "permutations", "dispersion", "dispersion_p"} (fake)
    """
    # TODO: skbio.stats.distance.permanova(DistanceMatrix, grouping, permutations=999).
    rng = np.random.default_rng(5)
    return {
        "r2": float(rng.uniform(0.01, 0.1)),
        "p": float(rng.uniform(0.001, 0.05)),
        "permutations": 999,
        "dispersion": float(rng.uniform(0.2, 0.6)),
        "dispersion_p": float(rng.uniform(0.1, 0.5)),
    }
