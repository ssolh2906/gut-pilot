"""Multiple-testing correction, shared by significance settings (G8) and
differential abundance (G10) — owned by neither page specifically.
"""

import numpy as np


def multiple_testing_correction(p_values: list[float], method: str, n_tested: int) -> list[float]:
    """Adjust p-values for multiple testing.

    Input: raw p-values, method ("bh"|"bonferroni"|"none"), total number of
    features tested (may be larger than len(p_values) if only a subset is
    passed in, matching the frontend's nTested-scaling behavior)
    Output: adjusted p-values (q-values), same order/length as input
    """
    p = np.asarray(p_values, dtype=float)
    if method == "none":
        return p.tolist()
    if method == "bonferroni":
        return np.minimum(1.0, p * n_tested).tolist()
    # Benjamini-Hochberg, scaled to n_tested when len(p) < n_tested.
    order = np.argsort(p)
    ranks = np.empty_like(order)
    ranks[order] = np.arange(1, len(p) + 1) * (n_tested / len(p))
    return np.minimum(1.0, p * n_tested / ranks).tolist()
