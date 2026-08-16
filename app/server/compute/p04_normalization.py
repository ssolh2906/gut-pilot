"""Normalization strategies (G6). No source notebook — not implemented yet.
Fake data, same shape as the real thing, so the API/frontend can integrate against it now.
"""

import numpy as np
import pandas as pd


def css_scale(df: pd.DataFrame) -> pd.DataFrame:
    """Cumulative sum scaling. Input: count df. Output: scaled df (same shape, fake)."""
    # TODO: no standard python library (CSS is from R's metagenomeSeq) — implement by hand.
    rng = np.random.default_rng(0)
    fake = rng.uniform(0, 50, size=df.shape)
    return pd.DataFrame(fake, index=df.index, columns=df.columns)


def clr_transform(df: pd.DataFrame) -> pd.DataFrame:
    """Centered log-ratio transform. Input: count df. Output: transformed df (same shape, fake)."""
    # TODO: skbio.stats.composition.clr (needs zero replacement first, e.g.
    # skbio.stats.composition.multiplicative_replacement).
    rng = np.random.default_rng(1)
    fake = rng.normal(0, 1.5, size=df.shape)
    return pd.DataFrame(fake, index=df.index, columns=df.columns)
