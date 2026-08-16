## Test Cases — CRC Baxter Golden Dataset (End-to-End Agent Verification)

*Steps 1–8 specify what the agent should do at each gate. This document specifies how to check, with real numbers, that it actually did it. Every assertion below is anchored to one of three independent sources of ground truth: the original study, an independent published re-analysis, or a fresh independent recomputation done for this document directly on the bundled file. Nothing here is asserted from memory of "what CRC microbiome papers usually find" — every number is either quoted with a line-pinned citation or reproducible from `research/fixtures/baxter_ground_truth.py`.*

```yaml
test_suite: crc_baxter_golden
dataset: data/MicrobiomeHD/crc_baxter_results.tar.gz
comparison: H (n=172) vs CRC (n=120) — nonCRC/adenoma arm (n=198) dropped
covers: [ingestion, study_design, raw_qc, normalization, alpha_diversity,
         beta_diversity, differential_abundance, scientific_synthesis]
ground_truth_tiers:
  - original_study: Baxter et al. 2016, Genome Medicine
  - independent_reanalysis: Duvallet et al. 2017, Nature Communications
  - fresh_recomputation: research/fixtures/baxter_ground_truth.py (this doc)
status: >
  Reasoning layer and beta-diversity/normalization compute are not yet
  implemented (see the 2026-08-15 status assessment). Test cases below are
  written as concrete, numeric acceptance criteria ready to wire into
  pytest/CI once those exist — several (marked ⏳) can only be exercised
  once specific stubs in app/server/compute/ are replaced with real code.
```

### 0. Why crc_baxter is a good verification target, not just a good demo

A demo dataset only needs to look convincing. A **test** dataset needs an independently known right answer. crc_baxter turns out to satisfy both, for a reason worth stating plainly: it is one of the most heavily re-analyzed 16S datasets in the microbiome literature. It was published once with its own findings (Baxter et al. 2016), then re-processed from raw data with a completely different, independent pipeline as part of the MicrobiomeHD project itself (Duvallet et al. 2017) — and this document adds a third, fresh independent re-analysis directly on the exact bundled file in `data/MicrobiomeHD/`. All three converge. That convergence is what makes the test cases below "verifiable" rather than merely "plausible."

---

### 1. Dataset definition (exact scope every test case assumes)

| Parameter | Value | Source |
|---|---|---|
| Source file | `data/MicrobiomeHD/crc_baxter_results.tar.gz` → `crc_baxter_results/RDP/crc_baxter.otu_table.100.denovo.rdp_assigned` (122,510 OTUs × 490 samples) + `crc_baxter_results/crc_baxter.metadata.txt` | this repo |
| Full cohort | N=490: H=172, CRC=120, nonCRC/adenoma=198 | `DiseaseState` column; matches Baxter 2016 Table/Methods exactly |
| **Test-suite comparison** | **H (n=172) vs CRC (n=120), n=292 total** — nonCRC dropped | Matches Duvallet et al. 2017's explicit convention: *"In CRC studies with multiple control groups (e.g., healthy and non-CRC adenoma), only the healthy patients were used as controls"* [Duvallet2017, L112] |
| Genus aggregation | Sum raw integer OTU counts (or their relative-abundance equivalents) by the `g__` token in the RDP lineage string; discard OTUs unassigned at genus level | Matches `app/server/compute/loading.py::_extract_genus` and Duvallet et al.'s own pipeline [Duvallet2017, L19, L114] |
| Sample-ID join key | `Sample_Name_s` in metadata ↔ OTU table column headers (both numeric-looking strings, e.g. `2045653`) | verified directly against the file |
| Original 16S region / sequencer | V4, Illumina MiSeq | `dataset_info.yaml`, Baxter 2016 Methods |

---

### 2. Ground-truth sources

#### 2.1 Tier 1 — Original study (Baxter et al. 2016)

Baxter NT, Ruffin MT, Rogers MAM, Schloss PD. *Microbiota-based model improves the sensitivity of fecal immunochemical test for detecting colonic lesions.* Genome Medicine 8:37 (2016). doi:10.1186/s13073-016-0290-3. [PMC4823848]

Key facts to test against:
- **N=490** patients: 120 CRC, 198 adenoma, 172 normal, across four clinical sites (Toronto, Boston, Houston, Ann Arbor) [L37].
- **Samples were split across 3 sequencing runs, and assignment to runs was randomized with respect to diagnosis and demographics specifically to prevent batch confounding** [L29]. This is a load-bearing fact for the Study Design (G2) test cases below.
- The original pipeline **rarefied every sample to 10,000 reads** and kept OTUs present in **≥5% of samples** for their random-forest feature selection [L31].
- Random-forest analysis of Normal vs Cancer (not classic univariate DA) found the strongest CRC-associated OTUs belonged to *Porphyromonas asaccharolytica*, *Fusobacterium nucleatum*, *Parvimonas micra*, *Peptostreptococcus stomatis*, *Gemella* spp., and an unclassified *Prevotella* [L38].
- Most of the taxa enriched in **normal** individuals belonged to *Lachnospiraceae* and *Ruminococcaceae* (butyrate producers) [L40, L57].
- Sex had a significant effect on FIT result but **not** on overall microbiome structure (PERMANOVA p=0.07) [L52]; colonoscopy-prep timing (before vs. 1–2 weeks after) also showed no microbiome effect (PERMANOVA p=0.45) [L59]. Both are useful null-covariate checks.

#### 2.2 Tier 2 — Independent re-analysis (Duvallet et al. 2017 — the MicrobiomeHD paper itself)

Duvallet C, Gibbons SM, Gurry T, Irizarry RA, Alm EJ. *Meta-analysis of gut microbiome studies identifies disease-specific and shared responses.* Nature Communications 8:1784 (2017). [PMC5716994]

This is the paper `data/MicrobiomeHD/` and `data/file-S3.core_genera.txt` come from — the folders in this repo are literally its standardized-pipeline outputs. Its methodology is a second, independently defensible reference point for every normalization/statistics gate:

- Normalization: **relative abundance** (OTU count ÷ total sample reads), **not rarefaction**, then genus-level collapse by summing relative abundances [L19, L114]. This is a legitimate, published alternative to Baxter's own rarefy-to-10,000 choice — useful for testing that G6 doesn't treat "the published paper's method" as the only defensible option.
- QC: drop samples with <100 reads, OTUs with <10 reads total, OTUs present in <1% of samples within a study [L114].
- Test: **Kruskal-Wallis** per genus, **Benjamini-Hochberg FDR**, significance at **q<0.05** [L117].
- **Baxter-specific re-analysis result** [L1238–L1251]: *"Fusobacterium, Peptostreptococcus, Parvimonas, and Porphyromonas enriched in CRC patients (q≤0.05, KW tests). We also found higher levels of Victivallis, Peptoniphilus, Anaerococcus, Catenibacterium, Staphylococcus, Collinsella, Enterobacter, and Alloprevotella in CRC patients (q≤0.05, KW tests). We found that healthy controls were enriched in Lachnobacterium (genus within Lachnospiraceae), Gemmiger (within Ruminococcaceae), Clostridium XVIII, and Haemophilus (q≤0.05, KW tests)."*
- **Classification check**: Duvallet's own Random Forest AUC for this exact dataset was **≈0.77 (p=5.4×10⁻¹⁶)** [L1798] — a genuinely learnable, statistically real, but moderate signal. Not a slam-dunk AUC near 1.0; a test that expects a near-perfect classifier is wrong.
- **Cross-CRC-study meta-finding** (across all 4 of Duvallet's CRC cohorts, not Baxter alone): *"Dysbiosis associated with CRC is generally characterized by increased prevalence of ... Fusobacterium, Porphyromonas, Peptostreptococcus, Parvimonas, and Enterobacter genera ... there is a consistent decrease in the abundances of Faecalibacterium, Blautia, Bacteroides genera and organisms from the Lachnospiraceae family"* [L89, L1287–L1292]. Note this is a **cross-cohort aggregate** claim — Section 2.3 shows it does *not* hold at conventional significance within Baxter alone, which is itself an important test case (see TC-7.4).
- `data/file-S3.core_genera.txt` (this paper's own Supplementary Table 3, already bundled locally) independently confirms genus-level direction for the overlapping genera: `Collinsella→disease`, `Porphyromonas→disease`, `Anaerococcus→disease`, `Parvimonas→disease`, `Peptostreptococcus→disease`, `Fusobacterium→disease`, `Blautia→health`, `Faecalibacterium→health`, `Gemmiger→health`.

#### 2.3 Tier 3 — Fresh independent recomputation (this document)

`research/fixtures/baxter_ground_truth.py` re-derives genus-level relative abundances directly from the bundled `RDP/crc_baxter.otu_table.100.denovo.rdp_assigned` file — no code shared with `app/server/`, so it is a genuinely independent check, not a test of itself. Methodology matches Tier 2 (relative abundance → genus sum → H vs CRC → ≥1% prevalence filter → rank-sum test → BH-FDR, q<0.05); the rank-sum test is hand-implemented (pandas ranks + `scipy.special.ndtr`, avoiding a local broken `scipy.stats` install) but is the identical statistic to 2-group Kruskal-Wallis.

Reproduce with:
```bash
cd data/MicrobiomeHD && tar xzf crc_baxter_results.tar.gz && cd ../..
python research/fixtures/baxter_ground_truth.py
```

Results (`research/fixtures/baxter_genus_kw_results.csv` has the full table), computed 2026-08-15:

**15 genera significant at q<0.05**, enriched in **CRC**: Porphyromonas (q=2.4e-8), Peptostreptococcus (q=3.0e-8), Parvimonas (q=3.0e-8), Fusobacterium (q=2.1e-6), Alloprevotella (q=3.3e-4), Anaerococcus (q=4.1e-4), Eikenella (q=7.1e-3), Peptoniphilus (q=9.5e-3), Collinsella (q=0.027), Enterobacter (q=0.031), Catenibacterium (q=0.041), Gemella (q=0.041); enriched in **Healthy**: Clostridium_XVIII (q=0.020), Haemophilus (q=0.031), Gemmiger (q=0.049).

**12 of Duvallet's 12 reported CRC-enriched genera replicate directionally**, and 10 of 12 clear q<0.05 independently (Victivallis q=0.087 and Staphylococcus q=0.213 trend correctly but miss the cutoff — expected given minor pipeline differences: this recomputation's 1% genus-level prevalence filter vs. Duvallet's combined 1% OTU-level + genus-collapse filter). All 4 of the "core" random-forest taxa from the **original 2016 paper** (Fusobacterium, Porphyromonas, Peptostreptococcus, Parvimonas) are the four most significant hits in this recomputation by several orders of magnitude — independent agreement across three separately-coded pipelines spanning ten years.

Alpha diversity: **Shannon is flat** (H=2.342, CRC=2.353, p=0.967) while **observed richness is significantly higher in CRC** (H=52.8, CRC=58.6, p=7.8e-5) — a real, numeric confirmation of exactly the "richness up, Shannon flat, not a global diversity loss" pattern already scripted into the mock's Alpha page and `research/05_alpha_diversity_contextualized.md`.

Depth: median 9,000 (H) vs 13,300 (CRC), Mann-Whitney p=0.062 (borderline). **Below the 5,000-read floor: 50/172 H (29%) vs 21/120 CRC (17.5%)** — an asymmetric exclusion rate by group, real and worth flagging (see TC-3.2). **Below 10,000 reads — Baxter's own original rarefaction depth: 92/172 H (53.5%) vs 51/120 CRC (42.5%)** — adopting the published depth naively would delete over half the healthy arm, because this MicrobiomeHD-hosted reprocessing has lower per-sample depths than the original paper's raw data (see TC-4.1, the single most important test case in this document).

---

### 3. Test cases by pipeline step

Legend: ✅ = fully verifiable today from ground truth alone (no agent required). ⏳ = requires the reasoning layer or a currently-stubbed compute function (`normalization.py`, most of `beta_diversity.py`) to exist first; written now so it's ready to wire in.

#### TC-1 — Ingestion

| ID | Given | Assertion | Tolerance | Ground truth | Failure signal |
|---|---|---|---|---|---|
| TC-1.1 ✅ | The bundled `RDP/...rdp_assigned` table loaded and parsed | Parsed table has exactly 122,510 taxa rows × 490 sample columns before any filtering | exact | direct file inspection | Off-by-some-rows suggests a header/delimiter parsing bug |
| TC-1.2 ✅ | Genus aggregation via `g__` token extraction | Exactly 254 distinct genera recovered after dropping unassigned OTUs; 24,146/122,510 OTUs (19.7%) discarded as unassigned at genus level | ±1 genus (naming edge cases like `Escherichia/Shigella`) | `research/fixtures/baxter_ground_truth.py` output | A genus count far off this suggests the lineage parser is splitting on the wrong delimiter or mis-handling the trailing `d__denovoN` OTU tag |
| TC-1.3 ✅ | Sample-ID join between OTU table columns and `metadata.txt` | 490/490 samples join with **zero** dropped | exact | direct file inspection | Any join loss here silently shrinks N for every downstream page — this must be a hard-stop, not a warning (per Step 1's own spec) |
| TC-1.4 ✅ | Trailing `total` column check (upload contract) | This specific file has **no** trailing total column; the check should pass through cleanly, not falsely flag one | — | direct file inspection | False positive here would incorrectly halt ingestion |

#### TC-2 — Study Design (G1–G4)

| ID | Given | Assertion | Tolerance | Ground truth | Failure signal |
|---|---|---|---|---|---|
| TC-2.1 ✅ | Metadata has an explicit `DiseaseState` column (H/CRC/nonCRC) | G1 selects **metadata-based grouping**, not ID-prefix inference, and correctly identifies **three** arms, not two | exact | metadata file | Silently collapsing to 2 arms without a design decision to drop nonCRC (with justification) skips a real design choice |
| TC-2.2 ✅ | Multi-arm design (H/CRC/nonCRC) | Agent's design rationale for dropping `nonCRC` (adenoma) must be **stated explicitly**, and should match the field convention: only healthy controls used, non-CRC/adenoma excluded from this comparison | qualitative | Duvallet2017 [L112] | Silently dropping 198 samples without comment is scientifically indefensible even if the resulting comparison is correct |
| TC-2.3 ⏳ | No explicit batch/plate/sequencing-run column survives in the public SRA metadata (`Run_s` is a unique per-sample accession, not a shared batch label; `Center_Name_s`, `sequencer`, `LoadDate_s` are constant across all 490 samples) | G2 must **not fabricate** a batch check it has no column to run. It should state plainly that no batch metadata is available, and — since it can't compute a batch/group cross-tab — should cite the original study's design note instead: samples were randomized across 3 sequencing runs specifically to avoid diagnosis confounding [Baxter2016, L29] | qualitative | metadata inspection + Baxter2016 | An agent that either skips G2 silently, or fabricates a batch column/test with no basis, both fail — the correct behavior is "no column, but here's why that's less concerning than usual" |
| TC-2.4 ✅ | One sample per patient (verify via `Sample_Name_s` cardinality) | G3 resolves to **independent samples**; 490 distinct `Sample_Name_s` values, no duplicates → confirmed clean even though nothing forces this conclusion | exact | metadata file (490 unique IDs) | Per Step 2's own spec, this gate should still emit a gate-note confirming the check ran, not silence |
| TC-2.5 ✅ | Genus-level aggregation available (254 genera) vs. OTU-level (122,510 rows) vs. higher ranks | G4 recommends genus, and the feature-count table shown to the user must reflect the **actual computed counts for this dataset** (254 genera), not a hardcoded placeholder like the mock's fixed "187 features" | exact (254) | recomputation | A hardcoded feature count copied from the toy mock data is an immediate tell that G4 isn't reading the real loaded table |

#### TC-3 — Raw QC

| ID | Given | Assertion | Tolerance | Ground truth | Failure signal |
|---|---|---|---|---|---|
| TC-3.1 ✅ | Full per-sample depth distribution, H+CRC subset (n=292) | Reported stats: min=751, median=10,499, max=134,112, mean≈16,588 | ±1% (rounding) | recomputation | Depth stats far off this suggest the agent is summing post-filter counts, or including the dropped nonCRC arm |
| TC-3.2 ✅ | 5,000-read floor applied to H vs CRC | Exclusion is **asymmetric**: 50/172 H (29.1%) vs 21/120 CRC (17.5%) — nearly double the exclusion rate in Healthy. The agent's QC gate-note **must surface this asymmetry**, not just the pooled exclusion count | exact counts, qualitative flag required | recomputation | Reporting only "71/292 samples excluded" without noting the per-group skew misses a real, measurable imbalance risk exactly like the one Step 3's own spec warns about |
| TC-3.3 ✅ | 1,000-read floor (permissive preset) applied to H vs CRC | 2/172 H, 1/120 CRC below floor — negligible and roughly balanced at this permissive setting | exact | recomputation | Useful contrast case: same dataset, different floor preset, different confounding verdict — tests that the agent recomputes the imbalance check per-floor rather than caching one verdict |
| TC-3.4 ✅ | Sanity checklist | No parsing failures, no duplicate sample IDs expected on this file | — | TC-1 results | A checklist that reports failures on this clean file is a false positive bug |

#### TC-4 — Normalization / Rarefaction (the highest-value test in this suite)

| ID | Given | Assertion | Tolerance | Ground truth | Failure signal |
|---|---|---|---|---|---|
| TC-4.1 ✅ **critical** | An agent that (incorrectly) reasons "the original paper rarefied to 10,000 reads, so I will too" | The agent **must not** adopt 10,000 without first checking retention on *this* loaded table. Retention at 10,000: only 80/172 H (46.5%) and 69/120 CRC (57.5%) survive — over half the Healthy arm would be discarded | exact counts | recomputation | This is the single sharpest test of whether the agent derives its depth choice from computed curves on the live data (per its own spec: *"a genuine power/inclusion trade-off ... derived from this dataset's curves, not carried over from a different one"*) or is pattern-matching a number out of a cited paper. **Naively citing Baxter's own 10,000 as the "authoritative published depth" is the specific failure mode this test exists to catch.** |
| TC-4.2 ⏳ | Rarefaction curve plateau computed on H+CRC subset | A depth in a materially lower range than 10,000 (informed by the actual depth distribution — median 10,499, but with a long left tail down to 751) is the kind of value a real curve-plateau fit should propose; exact number depends on the plateau-detection implementation, so this is a **sanity-range check** (e.g., 3,000–7,000), not an exact-value check | range, not exact | derived from TC-3.1/TC-4.1 depth distribution | A proposed depth below ~2,000 or above ~9,000 warrants scrutiny — either under-using available depth or repeating the TC-4.1 failure at a smaller scale |
| TC-4.3 ✅ | G6 method choice, given this specific dataset has two independently published, defensible normalization precedents that disagree | The agent's gate-note must acknowledge **both** legitimate published choices for this exact dataset — Baxter's own rarefy-to-10,000 [Baxter2016, L31] and Duvallet's relative-abundance-only re-analysis [Duvallet2017, L19] — rather than presenting one as the only correct answer | qualitative | Tier 1 + Tier 2 sources | Presenting rarefaction as uncontested when the dataset's own re-analysis literature used a different, equally valid method is a real gap, not a hypothetical one, for this specific dataset |
| TC-4.4 ✅ | Post-floor-exclusion group balance at whatever final depth is chosen | Whatever depth G7 lands on, the agent must re-report the group balance at *that specific* depth (not reuse the TC-3.2 numbers computed at the QC floor) — TC-4.1 shows the exclusion profile changes substantially between 5,000 and 10,000 | qualitative | recomputation | Reusing a stale exclusion count from the QC page instead of recomputing at the chosen rarefaction depth is a subtle but real correctness bug |

#### TC-5 — Alpha Diversity

| ID | Given | Assertion | Tolerance | Ground truth | Failure signal |
|---|---|---|---|---|---|
| TC-5.1 ✅ **strong** | Shannon diversity, genus-level relative abundance, H vs CRC | **Not significant**: H mean=2.342, CRC mean=2.353, Mann-Whitney/KW p≈0.97 | p > 0.5 is a wide enough tolerance to allow implementation-specific variation (rarefaction iteration count, exact prevalence filter) while still failing a "CRC has drastically lower diversity" claim | recomputation; consistent with Duvallet2017's general finding of "no consistent reduction of alpha diversity" outside diarrhea/IBD [L96] | An agent reporting Shannon p<0.05 in either direction on this comparison, or claiming a large effect size, indicates a bug in the diversity computation or the group assignment |
| TC-5.2 ✅ **strong** | Observed genus richness, same comparison | **Significant, and CRC is *higher***: H mean=52.8, CRC mean=58.6, p=7.8e-5 | p < 0.01, direction must be CRC > H | recomputation | This is the exact "expectation mismatch" scenario the Alpha Diversity page is designed to catch (per its own spec: *"A common prior is that the CRC gut has lower diversity ... richness trends slightly higher"*). **If the agent's synthesis states or implies "CRC shows reduced diversity" for this dataset, that is a factual error, not a stylistic one** — the real data says the opposite for richness and nothing at all for Shannon |
| TC-5.3 ✅ | Given TC-5.1 and TC-5.2 together | The agent's narrative must explicitly reconcile "richness differs, Shannon doesn't" as **taxon-specific enrichment rather than a global diversity shift** — not report the two metrics as independent facts with no synthesis | qualitative | recomputation; matches the exact framing already written into the Alpha Diversity spec and the original mock's hardcoded agent card | A response that reports both numbers correctly but never connects them to "this points at a compositional/taxon-specific story, resolved on the DA page" has the right numbers and the wrong interpretation |

#### TC-6 — Beta Diversity ⏳ (blocked on real `run_permanova`/full `beta_diversity.py`, currently a stub)

| ID | Given | Assertion | Tolerance | Ground truth | Failure signal |
|---|---|---|---|---|---|
| TC-6.1 ⏳ | Bray-Curtis PERMANOVA, H vs CRC | Result should be **significant but modest** — real, learnable community-level separation, not a dramatic one. Anchor: Duvallet's independent Random Forest classifier on this exact comparison achieved AUC≈0.77 (p=5.4e-16) [L1798], i.e. a genuine but far-from-perfect signal | p < 0.05 expected; R² in a modest range (a PERMANOVA R² anywhere near 0 would contradict the AUC≈0.77 classification result; an R² implying near-total separation would be inconsistent with it too) | Duvallet2017 classification result, as an indirect but real anchor (a distance-based test and a classifier answer related but not identical questions — do not treat AUC and R² as interchangeable, only as mutually consistent-or-not) | A non-significant PERMANOVA here would contradict an independently well-established classification signal for this exact dataset and should trigger a re-check, not be reported as a null result |
| TC-6.2 ⏳ | Betadisper alongside PERMANOVA | Both numbers must be reported together, per the page's own hard reporting requirement | qualitative | Step 6 spec | Reporting PERMANOVA p alone without R² and betadisper fails the page's own stated bar, independent of what the numbers turn out to be |

#### TC-7 — Differential Abundance (the centerpiece)

| ID | Given | Assertion | Tolerance | Ground truth | Failure signal |
|---|---|---|---|---|---|
| TC-7.1 ✅ **critical** | Consensus DA (any reasonable method or method combination) on H vs CRC | Must recover, enriched in CRC and in this rank order of expected strength: **Porphyromonas, Peptostreptococcus, Parvimonas, Fusobacterium** as the top hits | require ≥3 of these 4 to clear whatever significance/consensus threshold the agent uses; direction must be CRC-enriched for all 4 | Independent triple agreement: original RF analysis [Baxter2016, L38], Duvallet KW re-analysis [L1244], this document's fresh recomputation (q < 5e-6 for all four) | Missing 2+ of these 4, or getting the direction backwards on any of them, indicates a real pipeline bug (aggregation, test implementation, or group-label mixup), not a legitimate methodological disagreement — three independently-coded analyses over 10 years agree on these four |
| TC-7.2 ✅ | Second-tier CRC-enriched genera | Should recover **several** (not necessarily all) of: Alloprevotella, Anaerococcus, Peptoniphilus, Collinsella, Enterobacter, Catenibacterium, Gemella, Eikenella, Staphylococcus, Victivallis | ≥4 of these 10 is a reasonable pass bar; recomputation q-values range from 3e-4 to 0.21, so weaker/borderline ones dropping out under a stricter method is expected and fine | recomputation + Duvallet2017 [L1246-1247] | Recovering *none* of these suggests the DA method is under-powered or mis-configured for this N; recovering many taxa *not* on either published/recomputed list with no biological plausibility check is a different failure (spurious/artifact-prone method) |
| TC-7.3 ✅ | Healthy-enriched genera | Should recover **at least** Gemmiger and/or Haemophilus and/or Clostridium_XVIII (all H-enriched, q<0.05 in the fresh recomputation) | ≥1 of these 3 | recomputation + Duvallet2017 [L1248-1250] | A DA run that finds *only* CRC-enriched taxa and nothing depleted in Healthy is a one-sided result worth independent scrutiny — real dysbiosis signatures in this dataset go both directions |
| TC-7.4 ✅ **important negative control** | Faecalibacterium, Blautia, Bacteroides | These are *cross-cohort meta-analytic* CRC-depleted genera per Duvallet's aggregate claim across all 4 of her CRC cohorts [L89] — but **within Baxter alone**, none reach q<0.05 (Faecalibacterium q=0.46, Blautia q=0.93, Bacteroides q=0.51), though the first two trend in the expected (H-enriched) direction | The agent must **not** claim these three as significant findings *of this run* — at most, note the correct directional trend and explicitly attribute the stronger claim to the cross-cohort literature, not to this single dataset | recomputation | This is the sharpest test of the "known-taxa cross-check" page's own stated principle — *"an expected taxon that is missing here is exactly as informative as one that is confirmed."* An agent that reports these three as significant CRC findings here is either overfitting its prior from the literature onto data that doesn't support it, or has a bug inflating significance |
| TC-7.5 ✅ | Prevalence filter (G10) at the default 10% threshold | Genus-level filter differs from the fresh recomputation's 1% threshold; re-running TC-7.1–7.4 at 10% prevalence should **still** recover the 4 core genera in TC-7.1 (all have prevalence well above 10% in the CRC arm — e.g. Fusobacterium, Parvimonas, Porphyromonas are common oral-pathogen colonizers, not ultra-rare taxa) | qualitative — same 4 genera survive a stricter filter | recomputation (prevalence values in `baxter_genus_kw_results.csv`) | If tightening the prevalence filter from 1% to the app's 10% default causes the 4 core genera to disappear, that indicates a prevalence-calculation bug (e.g. computed on the wrong sample subset), not a legitimate methodological sensitivity |

#### TC-8 — Scientific Synthesis / Next Steps

| ID | Given | Assertion | Tolerance | Ground truth | Failure signal |
|---|---|---|---|---|---|
| TC-8.1 ✅ | Synthesis must integrate TC-5 (alpha) + TC-6 (beta) + TC-7 (DA) into one coherent claim, per Step 8's own spec | Correct integrated claim: *"CRC did not show a global loss of diversity (richness trended slightly higher, Shannon flat), but community composition differed modestly (small but real beta-diversity separation), and the difference concentrates in a specific set of oral-pathogen-associated genera (Fusobacterium, Porphyromonas, Peptostreptococcus, Parvimonas) rather than broad community collapse."* | qualitative, but every clause must be individually falsifiable against TC-5/6/7 | synthesis of prior test cases | A synthesis that treats alpha, beta, and DA as three unrelated bullet points (the exact failure mode Step 8's own spec calls out) fails even if each individual number is correct |
| TC-8.2 ✅ | Literature validation against known CRC biology | Fusobacterium/Porphyromonas/Peptostreptococcus/Parvimonas should be correctly identified as previously-reported oral-pathogen-associated CRC taxa (not novel discoveries) — this is well-trodden ground, not a new finding | qualitative | Baxter2016, Duvallet2017, Yan2025, Queen2025 (see References) | Presenting these four genera as a novel discovery of this run, rather than a replication of well-established prior findings, overstates the result |
| TC-8.3 ✅ **meaningful-next-steps rubric** | Proposed next experiments | A **meaningful** next step must (a) name a specific hypothesis it discriminates, and (b) be checkable against data this project actually has or could get. Good example: *"cross-validate the Fusobacterium/Porphyromonas/Peptostreptococcus/Parvimonas signature against the other 5 CRC cohorts already bundled in `data/MicrobiomeHD/` (crc_zeller, crc_zackular, crc_xiang, crc_zhu, crc_zhao) to test whether it replicates independently of this single cohort's batch/site effects"* | qualitative rubric | this repo's own data holdings | A generic, non-actionable suggestion ("do more sequencing," "validate in a larger cohort" with no specifics) fails the rubric even if directionally reasonable — Step 8's own spec explicitly calls this out as the failure mode to avoid |
| TC-8.4 ✅ | Limitations section | Must name at least: (a) genus-level 16S resolution can't distinguish species/strain-level effects (e.g., which *Fusobacterium* species/subspecies — Queen et al. 2025 show subspecies-level differences matter [Queen2025]), (b) cross-sectional design cannot establish causality, (c) the depth-imbalance finding from TC-3.2/TC-4.1 as a residual, only partially-correctable confound | qualitative, all 3 present | TC findings above + Queen2025 | Omitting the depth-imbalance limitation after the pipeline itself surfaced it earlier (TC-3.2/TC-4.1) is an internal-consistency failure — the synthesis page should carry forward what earlier pages found, not restart with a clean slate |

---

### 4. Overall pass bar for "end-to-end verified on this dataset"

A pipeline run counts as verified against this suite when:
1. All ✅ test cases pass at their stated tolerance (these require no new compute — they're checkable against ground truth the moment ingestion, QC, and any DA method are wired up).
2. TC-4.1 specifically passes — this is the one test case in the suite that catches a real, demonstrated failure mode (naively trusting a cited depth) rather than a hypothetical one.
3. TC-7.1 and TC-7.4 both pass — recovering the true positives *and* correctly declining the false positives is what distinguishes "this pipeline does real statistics" from "this pipeline pattern-matches CRC genus names it has seen before."
4. ⏳ test cases are re-run once `normalization.py` and the stubbed half of `beta_diversity.py` are implemented; they are written now so nothing about the acceptance bar has to be reinvented later.

---

### 5. References

| Key | Citation |
|---|---|
| `Baxter2016` | Baxter NT, Ruffin MT, Rogers MAM, Schloss PD. Microbiota-based model improves the sensitivity of fecal immunochemical test for detecting colonic lesions. *Genome Medicine* 8:37 (2016). doi:10.1186/s13073-016-0290-3. PMC4823848 |
| `Duvallet2017` | Duvallet C, Gibbons SM, Gurry T, Irizarry RA, Alm EJ. Meta-analysis of gut microbiome studies identifies disease-specific and shared responses. *Nature Communications* 8:1784 (2017). PMC5716994 |
| `Yan2025` | Yan R, Zheng R, Han Y, Song G, Huo B, Sun H. Meta-analysis of gut microbiome reveals patterns of dysbiosis in colorectal cancer patients. *J Med Microbiol* (2025). doi:10.1099/jmm.0.002042. PMC12309989 |
| `Queen2025` | Queen J, et al. Fusobacterium nucleatum is enriched in invasive biofilms in colorectal cancer. *bioRxiv* (2025). doi:10.1101/2024.12.30.630810. PMC11722383 |
| `Wirbel2024` | Wirbel J, Essex M, Forslund SK, Zeller G. A realistic benchmark for differential abundance testing and confounder adjustment in human microbiome studies. *Genome Biology* (2024). doi:10.1186/s13059-024-03390-9. PMC11423519 |

All paperclip citations above were resolved and line-quoted live on 2026-08-15; re-resolve before final use per the runtime citation policy already established in `docs/gates/` and the earlier per-step research files — literature moves faster than this document will.
