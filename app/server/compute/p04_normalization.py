"""Normalization strategies (G6). No source notebook."""

import numpy as np
import pandas as pd
from skbio.stats.composition import clr, multi_replace


def select_quantile(df: pd.DataFrame, rel_diff: float = 0.10, grid: np.ndarray | None = None) -> float:
    """Adaptive quantile l_hat for CSS (Paulson et al. 2013, doi:10.1038/nmeth.2658):
    smallest quantile where the median absolute deviation of per-sample quantiles
    (around their cross-sample median) starts to blow up.

    Input: count df (index=taxon, columns=sample), instability threshold, quantile
    grid to scan (default 0.05..0.95 step 0.01)
    Output: selected quantile l_hat in (0, 1) — falls back to 0.5 if the instability
    point is never reached
    """
    if grid is None:
        grid = np.arange(0.05, 0.96, 0.01)
    q = np.zeros((len(grid), df.shape[1]))
    for j, col in enumerate(df.columns):
        x = df[col].to_numpy()
        x = x[x > 0]
        q[:, j] = np.quantile(x, grid)
    q_ref = np.median(q, axis=1)
    d = np.median(np.abs(q - q_ref[:, None]), axis=1)
    for i in range(len(grid) - 1):
        if d[i + 1] - d[i] >= rel_diff * d[i]:
            return float(grid[i])
    return 0.5


def _css_fit(df: pd.DataFrame, l_hat: float | None, N: float | None, floor_quantile: float) -> dict:
    if l_hat is None:
        l_hat = select_quantile(df)
    l_hat = max(l_hat, floor_quantile)

    scaling_factors = {}
    for col in df.columns:
        x = df[col].to_numpy()
        x = x[x > 0]
        q = np.quantile(x, l_hat)
        sf = x[x <= q].sum()
        scaling_factors[col] = sf if sf > 0 else 1
    sf = pd.Series(scaling_factors)

    if N is None:
        N = sf.median()

    return {"scaling_factors": sf, "offset": np.log2(sf / N), "l_hat": float(l_hat), "N": float(N)}


def css_scale(
    df: pd.DataFrame, l_hat: float | None = None, N: float | None = None, floor_quantile: float = 0.50
) -> pd.DataFrame:
    """Cumulative sum scaling (Paulson et al. 2013, doi:10.1038/nmeth.2658, PMID 24076764).
    Scales each sample by the cumulative sum of counts at or below its l_hat-quantile,
    rather than by total depth, so a handful of highly abundant features can't dominate
    the scaling factor. Same input/output shape as clr_transform, so either can feed
    the same downstream diversity/DA functions regardless of which G6 strategy is chosen.

    Input: count df (index=taxon, columns=sample; depth/prevalence QC expected to
    already be applied upstream via p03_qc_checks), l_hat quantile (None = adaptive,
    via select_quantile), common scaling constant N (None = median of per-sample
    scaling factors), floor_quantile = l_hat never goes below this
    Output: normalized df, same shape as df
    """
    fit = _css_fit(df, l_hat, N, floor_quantile)
    return df.div(fit["scaling_factors"], axis=1) * fit["N"]


def css_scaling_factors(
    df: pd.DataFrame, l_hat: float | None = None, N: float | None = None, floor_quantile: float = 0.50
) -> dict:
    """Per-sample CSS scaling factors and GLM offset, without the normalized counts
    themselves (use css_scale for those) — needed downstream by a differential
    abundance model (Paulson et al. 2013 use log2(sf/N) as a model offset).

    Input: same as css_scale
    Output: {"scaling_factors": Series indexed by sample, "offset": Series indexed
    by sample (log2(sf/N)), "l_hat": float, "N": float}
    """
    return _css_fit(df, l_hat, N, floor_quantile)


def clr_transform(df: pd.DataFrame) -> pd.DataFrame:
    """Centered log-ratio transform, columns (samples) as compositions.

    Input: count df (index=taxon, columns=sample), zero-replaced via
    skbio's multi_replace before the log-ratio
    Output: transformed df, same shape, index=taxon, columns=sample
    """
    rel = df.div(df.sum(axis=0), axis=1)
    # .copy(): skbio's multi_replace mutates its input array in place. Under
    # FastAPI, concurrent requests (e.g. rapid prevalence-threshold clicks on
    # the Differential page) run this in different threadpool threads at
    # once - without a copy here, `.values` can alias memory another
    # in-flight call is simultaneously replacing zeros in, corrupting both
    # (observed as NaN results downstream, intermittently, only under
    # concurrent load).
    replaced = multi_replace(rel.T.values.copy())
    transformed = clr(replaced)
    return pd.DataFrame(transformed.T, index=df.index, columns=df.columns)
