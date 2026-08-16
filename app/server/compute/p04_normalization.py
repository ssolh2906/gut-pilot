"""Normalization strategies (G6). No source notebook."""

import numpy as np
import pandas as pd
from skbio.stats.composition import clr, multi_replace


def css_scale(df: pd.DataFrame) -> pd.DataFrame:
    """Cumulative sum scaling. Input: count df. Output: scaled df (same shape, fake)."""
    # TODO: no standard python library (CSS is from R's metagenomeSeq) — implement by hand.
    rng = np.random.default_rng(0)
    fake = rng.uniform(0, 50, size=df.shape)
    return pd.DataFrame(fake, index=df.index, columns=df.columns)


def clr_transform(df: pd.DataFrame) -> pd.DataFrame:
    """Centered log-ratio transform, columns (samples) as compositions.

    Input: count df (index=taxon, columns=sample), zero-replaced via
    skbio's multi_replace before the log-ratio
    Output: transformed df, same shape, index=taxon, columns=sample
    """
    rel = df.div(df.sum(axis=0), axis=1)
    replaced = multi_replace(rel.T.values)
    transformed = clr(replaced)
    return pd.DataFrame(transformed.T, index=df.index, columns=df.columns)
