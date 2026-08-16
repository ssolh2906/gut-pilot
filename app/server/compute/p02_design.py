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


def check_sample_independence(sample_ids: list[str], metadata: pd.DataFrame) -> dict:
    """Check whether samples look independent or paired/repeated-measures (G3).

    Input: list of sample_id, metadata DataFrame (indexed by sample_id)
    Output: {"pairing": "independent"|"paired"} (fake)
    """
    # TODO: real check (e.g. repeated subject_id in metadata).
    return {"pairing": "independent"}
