"""Differential abundance testing and literature cross-check (G10)."""

import numpy as np
import pandas as pd


def run_differential_abundance(df: pd.DataFrame, grouping: list[str]) -> pd.DataFrame:
    """Per-taxon differential abundance between two groups (fake). No standard
    python library covers this end-to-end (candidates: ALDEx2/ANCOM-BC, both R).

    Input: count df (index=taxon, columns=sample), per-sample group labels
    (same order as df.columns)
    Output: DataFrame indexed by taxon with columns lfc, p, methods, dir, prevalence
    """
    # TODO: no real algorithm chosen yet — fake values, shape only.
    rng = np.random.default_rng(6)
    n = len(df.index)
    lfc = rng.normal(0, 1.5, size=n)
    return pd.DataFrame(
        {
            "lfc": lfc,
            "p": rng.uniform(1e-6, 0.5, size=n),
            "methods": rng.integers(1, 4, size=n),
            "dir": np.where(lfc > 0, "up", np.where(lfc < 0, "down", "ns")),
            "prevalence": (df > 0).mean(axis=1).values,
        },
        index=df.index,
    )


def known_taxa_crosscheck(da_results: pd.DataFrame, known_taxa: pd.DataFrame) -> pd.DataFrame:
    """Cross-reference this run's DA results against a literature table.

    Input: da_results from run_differential_abundance (indexed by taxon), known_taxa
    DataFrame with columns taxon_genus, direction_in_disease (see
    known_taxa_table.csv: disease, taxon_genus, direction_in_disease, ...)
    Output: DataFrame indexed by taxon_genus with columns literature_direction,
    this_run_direction, status ("confirmed"|"missing"|"novel")
    """
    rows = []
    da_genera = set(da_results.index)
    for _, row in known_taxa.iterrows():
        genus = row["taxon_genus"]
        lit_dir = row["direction_in_disease"]
        this_dir = da_results.loc[genus, "dir"] if genus in da_genera else None
        status = "missing" if this_dir is None else ("confirmed" if this_dir == lit_dir else "novel")
        rows.append(
            {"taxon_genus": genus, "literature_direction": lit_dir, "this_run_direction": this_dir, "status": status}
        )
    return pd.DataFrame(rows).set_index("taxon_genus")
