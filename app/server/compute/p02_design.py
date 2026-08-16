"""Study design: metadata classification, batch effects, sample independence (G1-G3).

Deciding WHICH candidate column is the real biological grouping (G1) or how
to handle a real batch association (G2) is a judgment call for the
Reasoning layer, not Compute - but surfacing the real candidates and their
real diagnostics (so Reasoning has actual numbers to select from and
Compute never hands it a number it didn't produce) belongs here.
"""

import pandas as pd
from scipy.stats import fisher_exact
from scipy.stats.contingency import association

# Generic keyword patterns for classifying metadata columns by likely role,
# per research/02_study_design.md's own column-role list. Real heuristic,
# not hardcoded to any one dataset's actual column names.
_OUTCOME_PATTERNS = ["disease", "diagnos", "group", "phenotype", "treatment", "case_control",
                     "status", "outcome", "condition", "exposure"]
_BATCH_PATTERNS = ["run", "batch", "plate", "lane", "center", "site", "instrument",
                   "sequencer", "extraction", "processing", "cohort", "laborator"]
_SUBJECT_PATTERNS = ["subject", "patient", "donor", "participant"]


def classify_metadata_columns(metadata: pd.DataFrame) -> dict:
    """Classify each metadata column by likely role, using column-name
    keyword matching plus cardinality (every value unique -> identifier;
    only one distinct value -> constant, can't explain any variation).

    Output: {column: {"role": "identifier"|"constant"|"likely_outcome"|
             "likely_batch"|"likely_subject"|"other", "n_unique": int,
             "sample_values": [str, ...]}}
    """
    n = len(metadata)
    classified = {}
    for col in metadata.columns:
        nunique = int(metadata[col].nunique(dropna=True))
        name = str(col).lower()
        if nunique <= 1:
            role = "constant"
        elif nunique >= n:
            role = "identifier"
        elif any(p in name for p in _SUBJECT_PATTERNS):
            role = "likely_subject"
        elif any(p in name for p in _OUTCOME_PATTERNS):
            role = "likely_outcome"
        elif any(p in name for p in _BATCH_PATTERNS):
            role = "likely_batch"
        else:
            role = "other"
        classified[str(col)] = {
            "role": role,
            "n_unique": nunique,
            "sample_values": [str(v) for v in metadata[col].dropna().unique()[:6]],
        }
    return classified


def value_counts_for(metadata: pd.DataFrame, sample_ids: list[str], column: str) -> dict:
    """Real value counts for one metadata column, restricted to the given
    sample_ids (G1's group counts)."""
    subset = metadata.loc[metadata.index.isin(sample_ids), column]
    return {str(k): int(v) for k, v in subset.value_counts().items()}


def batch_group_crosstab(batch: dict[str, str], group: dict[str, str]) -> pd.DataFrame:
    """Cross-tabulate batch vs. group membership (G2).

    Input: {sample_id: batch_label}, {sample_id: group_label} (same sample_id keys)
    Output: DataFrame, index=batch, columns=group, values=counts
    """
    df = pd.DataFrame({"batch": batch, "group": group})
    return pd.crosstab(df["batch"], df["group"])


def batch_association_stats(crosstab: pd.DataFrame) -> dict:
    """Association strength between batch and group (G2).

    Input: crosstab DataFrame from batch_group_crosstab
    Output: {"cramers_v": float, "fisher_exact_p": float | None}
    (fisher_exact_p is None unless the crosstab is exactly 2x2)
    """
    cramers_v = float(association(crosstab.values, method="cramer"))
    fisher_p = None
    if crosstab.shape == (2, 2):
        _, fisher_p = fisher_exact(crosstab.values)
        fisher_p = float(fisher_p)
    return {"cramers_v": cramers_v, "fisher_exact_p": fisher_p}


def check_sample_independence(sample_ids: list[str], metadata: pd.DataFrame) -> dict:
    """Check whether samples look independent or paired/repeated-measures (G3).

    Searches metadata for a subject/patient/donor-like column via
    classify_metadata_columns. If none exists, each sample is necessarily
    its own subject (independent by construction - there's no subject-level
    column to check repeats against). If one exists, counts actual repeats
    rather than assuming.

    Input: list of sample_id, metadata DataFrame (indexed by sample_id)
    Output: {"subject_id_variable": str|None, "n_subjects": int, "n_samples": int,
             "repeated_subjects": int, "pairing": "independent"|"paired_or_clustered"}
    """
    classified = classify_metadata_columns(metadata)
    subject_cols = [c for c, info in classified.items() if info["role"] == "likely_subject"]

    if not subject_cols:
        return {
            "subject_id_variable": None, "n_subjects": len(sample_ids),
            "n_samples": len(sample_ids), "repeated_subjects": 0, "pairing": "independent",
        }

    subject_col = subject_cols[0]
    subjects = metadata.loc[metadata.index.isin(sample_ids), subject_col]
    counts = subjects.value_counts()
    repeated = int((counts > 1).sum())
    return {
        "subject_id_variable": subject_col, "n_subjects": int(counts.shape[0]),
        "n_samples": len(sample_ids), "repeated_subjects": repeated,
        "pairing": "independent" if repeated == 0 else "paired_or_clustered",
    }
