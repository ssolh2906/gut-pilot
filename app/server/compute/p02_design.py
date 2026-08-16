"""Study design: batch effects, sample independence (G2, G3).

G1 (group definition) isn't here — inferring a naming pattern with any confidence
is a judgment call for the reasoning/AI-agent layer, not a compute function.
"""

import pandas as pd
from scipy.stats import fisher_exact
from scipy.stats.contingency import association


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


def check_sample_independence(sample_ids: list[str], metadata: pd.DataFrame, subject_column: str) -> dict:
    """Check for repeated-subject (paired/repeated-measures) structure (G3).
    Purely mechanical duplicate check — which metadata column identifies a subject,
    and what to do with the result, is a judgment for the reasoning/AI-agent layer.

    Input: list of sample_id, metadata DataFrame (indexed by sample_id), name of the
    column in metadata that identifies a subject
    Output: {"pairing": "independent"|"paired",
             "repeated_subjects": {subject_id: [sample_id, ...]}} (empty if independent)
    """
    subjects = metadata.loc[sample_ids, subject_column]
    counts = subjects.value_counts()
    repeated = counts[counts > 1].index
    if len(repeated) == 0:
        return {"pairing": "independent", "repeated_subjects": {}}
    repeated_subjects = {str(s): subjects[subjects == s].index.tolist() for s in repeated}
    return {"pairing": "paired", "repeated_subjects": repeated_subjects}
