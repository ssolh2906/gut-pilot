"""Differential abundance testing and literature cross-check (G10)."""

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu

from .p04_normalization import clr_transform
from .p05_stats_utils import multiple_testing_correction


def run_differential_abundance(df: pd.DataFrame, grouping: list[str]) -> pd.DataFrame:
    """Per-taxon differential abundance between exactly two groups, via CLR + Wilcoxon
    rank-sum — a simplified version of ALDEx2 (Fernandes et al. 2014, Microbiome,
    PMID 24910773, doi:10.1186/2049-2618-2-15) without its Monte-Carlo resampling.
    ANCOM-BC2/full ALDEx2 are the literature's preferred primary methods but both are
    R-only; this is the "transparent non-parametric sensitivity analysis" that
    research/07_differential_abundance.md accepts as a standalone, clearly-labeled method.

    Input: count df (index=taxon, columns=sample), per-sample group labels (exactly
    two distinct labels, same order as df.columns)
    Output: DataFrame indexed by taxon with columns:
      lfc         log2 fold change = (mean CLR in group B - mean CLR in group A) / ln(2),
                  i.e. ALDEx2's signed CLR difference ("diff.btw") rescaled to log2
      p           raw Wilcoxon rank-sum p-value (1.0 if the two groups are identical)
      q           Benjamini-Hochberg-adjusted p-value across all taxa tested
      dir         "up"|"down"|"ns"
      prevalence  fraction of samples with count > 0
    """
    clr_df = clr_transform(df)
    groups = pd.Series(grouping, index=df.columns)
    labels = groups.unique()
    if len(labels) != 2:
        raise ValueError("run_differential_abundance expects exactly two groups")
    cols_a, cols_b = groups[groups == labels[0]].index, groups[groups == labels[1]].index

    lfc, p = [], []
    for taxon in clr_df.index:
        x, y = clr_df.loc[taxon, cols_a].values, clr_df.loc[taxon, cols_b].values
        lfc.append((y.mean() - x.mean()) / np.log(2))
        # ``np.allclose(x, y)`` crashes when the groups have different sample
        # counts (Baxter has 172 H vs 120 CRC). The only degenerate case that
        # needs a forced p=1 is a single constant value across both groups.
        p.append(
            1.0
            if np.unique(np.concatenate([x, y])).size == 1
            else mannwhitneyu(x, y).pvalue
        )

    lfc = np.array(lfc)
    return pd.DataFrame(
        {
            "lfc": lfc,
            "p": p,
            "q": multiple_testing_correction(p, "bh", len(p)),
            "dir": np.where(lfc > 0, "up", np.where(lfc < 0, "down", "ns")),
            "prevalence": (df > 0).mean(axis=1).values,
        },
        index=df.index,
    )


def run_relative_abundance_differential_abundance(
    df: pd.DataFrame, grouping: list[str], prevalence_threshold: float = 0.10
) -> pd.DataFrame:
    """Reproduce the transparent MicrobiomeHD Baxter re-analysis.

    Counts are converted to per-sample relative abundance, features are
    filtered by outcome-independent prevalence, and the two groups are
    compared with Mann-Whitney U followed by Benjamini-Hochberg correction.
    This is reported as a benchmark/sensitivity analysis, not mislabeled as
    ALDEx2 or ANCOM-BC.
    """
    if not 0 <= prevalence_threshold <= 1:
        raise ValueError("prevalence_threshold must be between 0 and 1")
    groups = pd.Series(grouping, index=df.columns, dtype=str)
    labels = list(pd.unique(groups))
    if len(labels) != 2:
        raise ValueError(
            "run_relative_abundance_differential_abundance expects exactly two groups"
        )

    relative = df.div(df.sum(axis=0), axis=1)
    prevalence = (df > 0).mean(axis=1)
    relative = relative.loc[prevalence >= prevalence_threshold]
    cols_a = groups[groups == labels[0]].index
    cols_b = groups[groups == labels[1]].index

    rows = []
    for taxon in relative.index:
        x = relative.loc[taxon, cols_a].to_numpy(dtype=float)
        y = relative.loc[taxon, cols_b].to_numpy(dtype=float)
        p_value = (
            1.0
            if np.unique(np.concatenate([x, y])).size == 1
            else float(mannwhitneyu(x, y, alternative="two-sided").pvalue)
        )
        mean_a, mean_b = float(x.mean()), float(y.mean())
        rows.append(
            {
                "taxon": taxon,
                "mean_group_a": mean_a,
                "mean_group_b": mean_b,
                "log2_fold_change": float(
                    np.log2((mean_b + 1e-12) / (mean_a + 1e-12))
                ),
                "p": p_value,
                "direction": labels[1] if mean_b > mean_a else labels[0],
                "prevalence": float(prevalence.loc[taxon]),
            }
        )

    result = pd.DataFrame(rows).set_index("taxon")
    result["q"] = multiple_testing_correction(
        result["p"].tolist(), "bh", len(result)
    )
    return result.sort_values(["q", "p"])


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
