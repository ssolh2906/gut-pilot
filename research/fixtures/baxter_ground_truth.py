"""
Independent ground-truth recomputation for the crc_baxter (Baxter et al. 2016)
MicrobiomeHD dataset, following the Duvallet et al. 2017 (MicrobiomeHD paper)
standardized methodology as closely as possible from a fresh reading of the
bundled RDP-assigned OTU table -- NOT importing any app/server code, so this
serves as an independent check, not a test of itself.

NOTE on statistics: this environment's scipy.stats is broken (a scipy.spatial
import-time bug unrelated to this project), so Mann-Whitney U (rank-sum, with
normal approximation and tie correction) is implemented directly from pandas
ranks + scipy.special.ndtr. For a two-group comparison this is the identical
test Duvallet et al. ran via scipy.stats.mstats.kruskalwallis (Kruskal-Wallis
with k=2 groups reduces to the same rank-sum statistic as Mann-Whitney U; the
KW chi-square statistic H equals z**2 under the normal approximation used
here, so p-values match to numerical precision).

Methodology (matches Duvallet et al. 2017, Nat Commun, Methods section):
  1. Relative abundance = OTU count / total OTU-level reads per sample.
  2. Collapse OTUs to genus by SUMMING relative abundances (discard
     OTUs unassigned at genus level).
  3. Restrict comparison to H (healthy) vs CRC (drop the nonCRC/adenoma arm),
     matching Duvallet's explicit convention for CRC studies with >1 control
     group ("only the healthy patients were used as controls").
  4. Genus-level prevalence filter: keep genera present (non-zero) in >=1% of
     the H+CRC samples (Duvallet's OTU-level prevalence filter, applied here
     at genus level as the nearest equivalent).
  5. Rank-sum (Mann-Whitney U / 2-group Kruskal-Wallis) test per genus on
     relative abundance, H vs CRC.
  6. Benjamini-Hochberg FDR correction across all tested genera.
  7. Significance: q < 0.05 (Duvallet's threshold).

To reproduce: extract the tarball once, then run this script.

    cd data/MicrobiomeHD
    tar xzf crc_baxter_results.tar.gz
    python research/fixtures/baxter_ground_truth.py

Tested against pandas 3.0.3 / numpy 2.4.6 / statsmodels 0.14.6. If your
scipy.stats import is healthy, scipy.stats.mannwhitneyu/kruskal are drop-in
replacements for the hand-rolled mannwhitney_p() below -- this was only
hand-implemented because of a local scipy.spatial import-time bug.
"""
import os
import pandas as pd
import numpy as np
from scipy.special import ndtr
from statsmodels.stats.multitest import multipletests

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = os.environ.get(
    "BAXTER_DIR",
    os.path.join(REPO_ROOT, "data", "MicrobiomeHD", "crc_baxter_results"),
)
OTU_TABLE = f"{BASE}/RDP/crc_baxter.otu_table.100.denovo.rdp_assigned"
METADATA = f"{BASE}/crc_baxter.metadata.txt"


def extract_genus(taxonomy: str):
    for token in taxonomy.split(";"):
        token = token.strip()
        if token.startswith("g__"):
            genus = token[3:].strip()
            return genus if genus else None
    return None


def mannwhitney_p(x: np.ndarray, y: np.ndarray) -> float:
    """Two-sided Mann-Whitney U p-value via normal approximation with tie correction."""
    n1, n2 = len(x), len(y)
    all_vals = np.concatenate([x, y])
    ranks = pd.Series(all_vals).rank().to_numpy()
    r1 = ranks[:n1].sum()
    u1 = r1 - n1 * (n1 + 1) / 2
    mu = n1 * n2 / 2
    # tie correction
    _, counts = np.unique(all_vals, return_counts=True)
    n = n1 + n2
    tie_term = (counts**3 - counts).sum()
    sigma2 = (n1 * n2 / 12) * ((n + 1) - tie_term / (n * (n - 1))) if n > 1 else n1 * n2 * (n + 1) / 12
    sigma = np.sqrt(sigma2) if sigma2 > 0 else 1e-12
    z = (u1 - mu) / sigma
    p = 2 * (1 - ndtr(abs(z)))
    return p


print("Loading OTU table...")
otu = pd.read_csv(OTU_TABLE, sep="\t", index_col=0)
print("OTU table shape:", otu.shape)

meta = pd.read_csv(METADATA, sep="\t")
id_col = "sample_id" if "sample_id" in meta.columns else "Sample_Name_s"
meta = meta.set_index(id_col)
meta.index = meta.index.astype(str)
print("Metadata shape:", meta.shape)

common = [c for c in otu.columns if c in meta.index]
print(f"Samples in OTU table: {otu.shape[1]}, in metadata: {meta.shape[0]}, common: {len(common)}")
otu = otu[common]
meta = meta.loc[common]

depth = otu.sum(axis=0)
rel = otu.div(depth, axis=1)

genus_labels = pd.Series([extract_genus(t) for t in otu.index], index=otu.index)
n_unassigned = int(genus_labels.isna().sum())
print(f"OTUs unassigned at genus level (dropped): {n_unassigned} / {len(genus_labels)}")
rel = rel.assign(genus=genus_labels.values)
genus_rel = rel.dropna(subset=["genus"]).groupby("genus").sum()
print("Genus-level relative-abundance table shape:", genus_rel.shape)

group = meta["DiseaseState"]
keep = group[group.isin(["H", "CRC"])].index
genus_rel_hc = genus_rel[keep]
group_hc = group.loc[keep]
depth_hc = depth.loc[keep]
print(f"\nH vs CRC subset: n={len(keep)}  (H={sum(group_hc=='H')}, CRC={sum(group_hc=='CRC')})")

h_depth = depth_hc[group_hc == "H"].to_numpy()
c_depth = depth_hc[group_hc == "CRC"].to_numpy()
depth_p = mannwhitney_p(h_depth, c_depth)
print(f"\nDepth confound check (Mann-Whitney, H vs CRC library depth): p={depth_p:.4g}")
print(f"  H median depth={np.median(h_depth):.0f}  CRC median depth={np.median(c_depth):.0f}")
below_floor = depth_hc < 5000
print(f"  Below 5,000-read floor: H={below_floor[group_hc=='H'].sum()}/{sum(group_hc=='H')}  "
      f"CRC={below_floor[group_hc=='CRC'].sum()}/{sum(group_hc=='CRC')}")
below_1000 = depth_hc < 1000
print(f"  Below 1,000-read floor: H={below_1000[group_hc=='H'].sum()}/{sum(group_hc=='H')}  "
      f"CRC={below_1000[group_hc=='CRC'].sum()}/{sum(group_hc=='CRC')}")

n_samples = genus_rel_hc.shape[1]
prevalence = (genus_rel_hc > 0).sum(axis=1) / n_samples
kept_genera = prevalence[prevalence >= 0.01].index
print(f"\nGenera passing >=1% prevalence filter: {len(kept_genera)} / {genus_rel_hc.shape[0]}")

h_mask = (group_hc == "H").to_numpy()
c_mask = (group_hc == "CRC").to_numpy()
rows = []
for g in kept_genera:
    vals = genus_rel_hc.loc[g]
    h_vals = vals[h_mask].to_numpy()
    c_vals = vals[c_mask].to_numpy()
    p = mannwhitney_p(h_vals, c_vals)
    mean_h, mean_c = h_vals.mean(), c_vals.mean()
    rows.append({"genus": g, "p": p, "mean_H": mean_h, "mean_CRC": mean_c,
                 "direction": "CRC" if mean_c > mean_h else "H"})

res = pd.DataFrame(rows).set_index("genus")
res["q"] = multipletests(res["p"], method="fdr_bh")[1]
res = res.sort_values("q")

sig = res[res["q"] < 0.05]
print(f"\n=== Significant genera (q < 0.05), n={len(sig)} of {len(res)} tested ===")
for g, row in sig.iterrows():
    fc = (row["mean_CRC"] + 1e-12) / (row["mean_H"] + 1e-12)
    print(f"  {g:25s} q={row['q']:.4g}  p={row['p']:.4g}  dir={row['direction']:5s}  "
          f"mean_H={row['mean_H']:.5f}  mean_CRC={row['mean_CRC']:.5f}  FC(CRC/H)={fc:.2f}")

benchmark_up = ["Fusobacterium", "Porphyromonas", "Peptostreptococcus", "Parvimonas", "Enterobacter",
                "Victivallis", "Peptoniphilus", "Anaerococcus", "Catenibacterium", "Staphylococcus",
                "Collinsella", "Alloprevotella"]
benchmark_down = ["Faecalibacterium", "Blautia", "Bacteroides", "Lachnobacterium", "Gemmiger",
                   "Haemophilus"]
print("\n=== Literature-benchmark genera (Baxter 2016 RF + Duvallet 2017 KW re-analysis) ===")
for g in benchmark_up + benchmark_down:
    if g in res.index:
        row = res.loc[g]
        print(f"  {g:25s} q={row['q']:.4g}  p={row['p']:.4g}  dir={row['direction']:5s}  "
              f"mean_H={row['mean_H']:.5f}  mean_CRC={row['mean_CRC']:.5f}")
    else:
        print(f"  {g:25s} not present after prevalence filter / not in table")


def shannon_entropy(p: np.ndarray) -> float:
    p = p[p > 0]
    return float(-(p * np.log(p)).sum())


shannon = genus_rel_hc.apply(lambda col: shannon_entropy(col.to_numpy()), axis=0)
h_shannon = shannon[h_mask].to_numpy()
c_shannon = shannon[c_mask].to_numpy()
shannon_p = mannwhitney_p(h_shannon, c_shannon)
print(f"\n=== Alpha diversity (Shannon, genus-level relative abundance) ===")
print(f"  H mean={h_shannon.mean():.3f}  CRC mean={c_shannon.mean():.3f}  Mann-Whitney p={shannon_p:.4g}")

observed = (genus_rel_hc > 0).sum(axis=0)
h_obs = observed[h_mask].to_numpy()
c_obs = observed[c_mask].to_numpy()
obs_p = mannwhitney_p(h_obs, c_obs)
print(f"  Observed genera: H mean={h_obs.mean():.1f}  CRC mean={c_obs.mean():.1f}  Mann-Whitney p={obs_p:.4g}")

OUT_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "baxter_genus_kw_results.csv")
res.to_csv(OUT_CSV)
print(f"\nFull results written to {OUT_CSV}")
