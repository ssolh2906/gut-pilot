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


def compute_feature_counts(taxonomy_map: dict) -> dict:
    """Distinct named-feature count at each rank, for G4's option list and
    study_design.feature_counts. "Unclassified" is not counted as a feature.

    Input: {feature_id: {"phylum":..., ..., "genus":...}} (e.g. from
    ingestion.load_dataset's taxonomy_map)
    Output: {"phylum": n, "class": n, "order": n, "family": n, "genus": n}
    """
    counts = {}
    for rank in _RANK_PREFIXES:
        labels = {ranks[rank] for ranks in taxonomy_map.values() if rank in ranks}
        counts[rank] = len(labels)
    return counts
