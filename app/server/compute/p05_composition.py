"""Community composition: collapse to the top-N most abundant taxa for display."""

import pandas as pd


def top_n_composition(rel_abundance: pd.DataFrame, n: int) -> pd.DataFrame:
    """Keep the top-n taxa by mean relative abundance, bucket the rest into "Other".

    Input: relative-abundance df (index=taxon, columns=sample, from
    p06_beta_diversity.relative_abundance), n top taxa to keep
    Output: df indexed by top-n taxa + "Other" (n+1 rows), columns=sample,
    each column still sums to 1
    """
    mean_abundance = rel_abundance.mean(axis=1)
    top = mean_abundance.sort_values(ascending=False).index[:n]
    result = rel_abundance.loc[top].copy()
    result.loc["Other"] = rel_abundance.drop(index=top).sum(axis=0)
    return result
