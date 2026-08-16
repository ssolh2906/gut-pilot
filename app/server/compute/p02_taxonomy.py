"""Taxonomic rank parsing and aggregation (G4)."""

import pandas as pd

_RANK_PREFIXES = {"phylum": "p__", "class": "c__", "order": "o__", "family": "f__", "genus": "g__"}


def parse_lineage(taxonomy: str) -> dict:
    """Extract each named rank from an RDP taxonomy string.

    Input: taxonomy string, e.g. "k__Bacteria;p__...;g__Bacteroides;s__;d__denovo84068"
    Output: {"phylum": ..., "class": ..., "order": ..., "family": ..., "genus": ...}
    (missing/empty ranks omitted)
    """
    tokens = [t.strip() for t in taxonomy.split(";")]
    result = {}
    for rank, prefix in _RANK_PREFIXES.items():
        for token in tokens:
            if token.startswith(prefix):
                label = token[len(prefix):].strip()
                if label:
                    result[rank] = label
                break
    return result


def aggregate_by_rank(df: pd.DataFrame, rank: str) -> pd.DataFrame:
    """Collapse a taxonomy-indexed count table to a given rank.

    Input: count DataFrame indexed by full taxonomy string (not yet collapsed to
    genus, unlike p01_loading.load_count_table's output), rank name
    ("phylum"|"class"|"order"|"family"|"genus")
    Output: DataFrame collapsed to that rank (unclassified rows grouped as "Unclassified")
    """
    labels = [parse_lineage(t).get(rank, "Unclassified") for t in df.index]
    return df.groupby(labels).sum()
