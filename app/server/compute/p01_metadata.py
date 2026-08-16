"""Sample metadata loading (Upload page)."""

import pandas as pd


def load_metadata(path: str) -> pd.DataFrame:
    """Load a sample metadata table. Input: path to *.metadata.txt (tab-separated,
    first column = sample_id). Output: DataFrame indexed by sample_id.
    """
    return pd.read_csv(path, sep="\t", index_col=0)
