"""Sample metadata loading (Upload page)."""

import pandas as pd


def load_metadata(path: str) -> pd.DataFrame:
    """Load a sample metadata table. Input: path to *.metadata.txt (tab-separated,
    first column = sample_id). Output: DataFrame indexed by sample_id.
    """
    try:
        return pd.read_csv(path, sep="\t", index_col=0)
    except UnicodeDecodeError:
        # Real metadata files aren't always clean UTF-8 - e.g. cdi_schubert's
        # ships a "PowerSoil®-htp" kit name encoded as Windows-1252/Latin-1.
        # That's cosmetic (a product name in a free-text field, not sample
        # IDs or counts), so fall back rather than hard-failing ingestion
        # over one stray byte outside the columns that actually matter.
        return pd.read_csv(path, sep="\t", index_col=0, encoding="latin-1")
