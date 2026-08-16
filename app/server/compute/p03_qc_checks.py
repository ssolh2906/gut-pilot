"""Raw data sanity checks and depth summary (G5)."""

import pandas as pd


def depth_summary(df: pd.DataFrame) -> dict:
    """Per-sample read depth summary stats.

    Input: count DataFrame (index=taxon, columns=sample)
    Output: {"n_samples", "total_reads", "mean_depth", "min_depth", "max_depth"}
    """
    depths = df.sum(axis=0)
    return {
        "n_samples": int(len(depths)),
        "total_reads": int(depths.sum()),
        "mean_depth": float(depths.mean()),
        "min_depth": int(depths.min()),
        "max_depth": int(depths.max()),
    }


def find_duplicate_sample_ids(columns: list[str]) -> list[str]:
    """Find sample IDs that appear more than once.

    Input: list of sample_id (e.g. df.columns)
    Output: list of duplicated sample_id (each listed once)
    """
    seen, dupes = set(), set()
    for c in columns:
        (dupes if c in seen else seen).add(c)
    return sorted(dupes)


def check_non_negative_integers(df: pd.DataFrame) -> bool:
    """Check that every count is a non-negative integer.

    Input: count DataFrame
    Output: True if all values are non-negative whole numbers
    """
    values = df.to_numpy()
    return bool((values >= 0).all() and (values == values.astype(int)).all())


def flag_below_floor(depths: dict[str, int], floor: int) -> list[str]:
    """Sample IDs whose depth falls below a floor.

    Input: {sample_id: depth}, floor threshold
    Output: list of sample_id with depth < floor
    """
    return [s for s, d in depths.items() if d < floor]
