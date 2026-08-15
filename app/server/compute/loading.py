"""Count table loading and sample filtering, shared by alpha/beta diversity compute."""

import pandas as pd


def _extract_genus(taxonomy: str) -> str:
    """Pull the genus label out of an RDP taxonomy string.

    Input: taxonomy string, e.g. "k__Bacteria;p__...;g__Bacteroides;s__;d__denovo84068"
    Output: genus name (e.g. "Bacteroides"), or "Unclassified" if no g__ token / it's empty
    """
    for token in taxonomy.split(";"):
        token = token.strip()
        if token.startswith("g__"):
            genus = token[3:].strip()
            return genus if genus else "Unclassified"
    return "Unclassified"


def load_count_table(path: str) -> pd.DataFrame:
    """Load an RDP-assigned OTU count table and collapse it to genus level.

    Input: path to a tab-separated file (first column = taxonomy string, remaining
    columns = per-sample read counts), e.g. data/raw_data/.../RDP/*.rdp_assigned
    Output: DataFrame indexed by genus, columns = sample_id, values = summed counts
    """
    df = pd.read_csv(path, sep="\t", index_col=0)
    if "total" in df.columns:
        df = df.drop(columns=["total"])
    df = df.fillna(0)
    df.index = df.index.map(_extract_genus)
    return df.groupby(df.index).sum()


def filter_samples(df: pd.DataFrame, exclude: list[str]) -> pd.DataFrame:
    """Drop excluded sample columns from a count table.

    Input: count DataFrame, list of sample_id to exclude
    Output: DataFrame with those columns removed
    """
    keep = [s for s in df.columns if s not in exclude]
    return df[keep]
