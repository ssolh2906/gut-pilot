"""Synthetic count table for exercising the pipeline before real ingestion
(MicrobiomeHD / Baxter CRC 16S) is wired up. Same shape `loading.load_count_table`
produces: index=genus, columns=sample_id, values=non-negative integer counts.

24 samples (H-01..H-12, C-01..C-12). Depths are pinned so two samples
(H-09, C-04) fall below a 5,000-read floor and the default 4,200-read
rarefaction threshold retains 22 of 24 - mirroring the reference mock so
gate responses read the same way during development.
"""

import numpy as np
import pandas as pd

GENERA = [
    "Bacteroides", "Fusobacterium", "Faecalibacterium", "Prevotella",
    "Parvimonas", "Roseburia", "Blautia", "Ruminococcus",
    "Peptostreptococcus", "Gemella", "Solobacterium", "Porphyromonas",
    "Alistipes", "Akkermansia", "Other",
]

_DEPTH_OVERRIDES = {"H-09": 1842, "C-04": 2116, "H-06": 5410, "C-03": 5880}


def make_fixture_count_table(seed: int = 20260814) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    sample_ids = [f"H-{i:02d}" for i in range(1, 13)] + [f"C-{i:02d}" for i in range(1, 13)]

    columns = {}
    for sid in sample_ids:
        depth = _DEPTH_OVERRIDES.get(sid)
        if depth is None:
            depth = int(rng.integers(6200, 30000))
        weights = rng.dirichlet(np.ones(len(GENERA)) * 0.6)
        counts = rng.multinomial(depth, weights)
        columns[sid] = counts

    return pd.DataFrame(columns, index=GENERA)
