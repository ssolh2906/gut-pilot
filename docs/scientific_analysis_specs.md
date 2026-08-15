# Gut Pilot — Scientific Analysis Specs (per-step agent instructions)

Source of truth for what "THE SKEPTICAL REVIEWER" needs to know to run each
page of the pipeline and defend its choices. One section per pipeline step,
1:1 with `app/client/src/App.jsx`'s `PAGES` array and the gates (`G1`–`G10`)
defined in `data/gut-pilot mock 260814.html`. Compiled against literature
retrieved live via `paperclip` on 2026-08-15; see the Reference Appendix for
provenance tiers.

## How to integrate this into the multi-agent flow

Each step below is written to be lifted almost verbatim into that step's
agent prompt. The structure is deliberately uniform so a step-runner can
parse it programmatically:

```yaml
step_id: normalization          # matches page_key in PAGES
page_key: rarefy
gate_ids: [G6, G7]
inputs: [genus_table, per_sample_depth, rarefaction_curves]
outputs: [gate_note, agent_proposal_card, debate_box]
```

Below each YAML header is one **decision table** — the rows are exactly the
gates that step must resolve — followed by **Agent guidance**, free-text
reasoning the table can't carry (decision algorithms, edge cases, what to do
when the data disagrees with the default). Treat the table as the
"parameters" and the guidance as the "system prompt body" for that step.

Table columns, defined once here so they aren't repeated eight times:

| Column | Meaning |
|---|---|
| Gate | ID from the mock, or `—` for steps with no formal gate |
| Decision | The question the agent must resolve before continuing |
| Options → when to pick | Each choice and the concrete condition that favors it |
| Default | What the agent proposes absent contrary evidence, and why |
| Diagnostics to compute first | What the agent must calculate before it is allowed to decide |
| Method / test | The statistical procedure backing the decision |
| Key pitfall | The specific way this decision goes wrong silently |
| Evidence | Short citation key, expanded in the Reference Appendix |

**Citation policy at runtime:** every `[Key YYYY]` below is a live citable
claim, not a fixed string. Before the agent surfaces a citation in a
gate-note or the References page, it should re-resolve it with
`paperclip lookup doi "<doi>"` (or `search`) and pull the line-pinned quote
it is actually leaning on — literature changes faster than this document
will. DOIs marked Tier B in the appendix were not resolvable in the
paperclip corpus at compile time (pre-digitization ecology/stats journals,
book chapters) and should be re-verified independently, not asserted from
this document alone.

**MicrobiomeHD note:** the validation corpus (`data/MicrobiomeHD/`) ships
OTU-level tables (`RDP/<ds>.otu_table.100.denovo.rdp_assigned`, rows tagged
`d__denovoN`), not pre-collapsed genus tables. Genus aggregation (Study
Design, G4) must be a **sum of raw integer OTU counts** per genus, never a
re-normalization of relative abundances — the counts have to stay integers
or every downstream step that depends on discrete counts (rarefaction,
Chao1, ALDEx2, ANCOM-BC) is invalid.

---

## Step 1 — Upload & Ingestion

```yaml
step_id: ingestion
page_key: upload
gate_ids: []
inputs: [raw_count_table, optional_metadata_tsv]
outputs: [parsed_genus_table, parse_report]
```

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| — | Delimiter detection | CSV vs TSV, sniffed from header row | Auto-detect, fail loudly if ambiguous | Count of `,` vs `\t` in header line; check for quoted fields | Simple heuristic sniff, not a statistical test | A taxon name containing a comma (rare but real in some lineage strings) silently breaks CSV parsing | — |
| — | Lineage column parsing | Full lineage (`k__…;g__…`) vs bare genus name vs OTU ID with separate taxonomy file | Parse `;`-delimited lineage, take deepest non-empty rank as the working label | Regex-match `k__|p__|c__|o__|f__|g__|s__` prefixes in column 1 | String parsing | MicrobiomeHD-style tables append a trailing `d__denovoN` OTU tag after `s__` — do not treat that as the species/strain name | — |
| — | Trailing `total` column | Drop vs keep as a QC check | Drop, but assert it equals the row-wise sum of sample columns first | Sum sample columns per row, diff against declared total | Arithmetic check | A `total` column that doesn't reconcile means upstream truncation or a parsing offset — this is a hard-stop, not a warning | — |
| — | Metadata join | `metadata.tsv` present vs absent | If present, inner-join on `sample_id`; if absent, fall through to Study Design's inferred-grouping gate (G1) | Set-compare sample IDs in the count table vs metadata; report symmetric difference | Set operations | Silent mismatch on sample-ID casing/whitespace (`H-01` vs `h-01 `) drops samples without any error — always report the join's dropped count explicitly | — |
| — | Duplicate / non-integer counts | Reject vs coerce | Reject the file; a non-integer count table means it was already normalized upstream and every downstream discrete-count method (rarefaction, Chao1, ALDEx2 zero-handling) is invalid on it | Check all sample-column values are non-negative integers | Type check | Silently `round()`-ing floats hides the fact the input was pre-normalized (e.g. relative abundance or CSS-scaled) and should be flagged to the user, not fixed | — |

**Agent guidance.** This step has no scientific gate because there's no
scientific judgment to defend yet — it's a contract check. The one thing
worth investing agent effort in is the **parse report**: a structured list
of every row/column dropped or coerced, because everything from here on
inherits silently from whatever this step let through. Do not proceed to
Study Design until sample-ID sets in the count table and (if present)
metadata reconcile.

---

## Step 2 — Study Design

```yaml
step_id: study_design
page_key: design
gate_ids: [G1, G2, G3, G4]
inputs: [parsed_genus_table, optional_metadata, sample_id_pattern]
outputs: [group_assignment, batch_handling, pairing_mode, working_rank, gate_notes]
```

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G1 | Group definition | (a) metadata `group` column, (b) inferred from sample-ID prefix pattern, (c) manual per-sample assignment, (d) no grouping / single cohort | (a) if metadata present; else (b) with a stated confidence from pattern regularity; never silently fall to (d) | Regex-cluster sample IDs by prefix; measure pattern consistency (fraction of IDs matching the dominant pattern) | Pattern-match confidence scoring | Inferring groups from ID prefixes that actually encode something else (site, timepoint, sequencing batch) — cross-check the inferred split against read-depth and batch distributions for suspicious correlation | — |
| G2 | Batch handling | (a) include batch as a PERMANOVA covariate, (b) stratify permutations by batch, (c) proceed and record the confounding risk | (c) only if batch is independent of group; otherwise (a) or (b) — never silently ignore a batch column that correlates with group | Cross-tabulate `batch × group`; compute a chi-square or Cramér's V for association | Chi-square test of independence, Cramér's V effect size | Batch that tracks group membership almost perfectly (e.g. all cases run on one plate) makes the "disease" signal indistinguishable from a processing signal — this is the single most common way microbiome studies produce non-reproducible findings | Yan 2025 [Yan2025] (ConQuR/PLSDA-batch/MMUPHin all exist because uncorrected batch effects inflate false discoveries in pooled cohorts) |
| G3 | Sample independence / pairing | Independent samples (Wilcoxon rank-sum, unrestricted permutations) vs paired/repeated measures (Wilcoxon signed-rank, permutations restricted within subject) | Independent, unless metadata declares a `subject_id` or repeated `sample_id` prefix pattern indicating longitudinal sampling | Check metadata for a subject/patient identifier column; check for duplicate subject IDs across timepoints | Structural check on metadata schema, confirmed even when clean | Treating longitudinal samples from the same subject as independent inflates the effective sample size and invalidates every p-value on the run — this is confirmed explicitly even when the check is clean, because the cost of being wrong here is total | — |
| G4 | Taxonomic rank | Phylum (fewest features, most power, least resolution) vs family vs genus (most features that stay biologically interpretable) vs species/OTU (finest, sparsest, least power) | Genus — the conventional power/resolution compromise for 16S data, where species-level calls from short amplicons are often unreliable anyway | Count features retained at each rank after collapsing; note how much resolution is lost at each step (e.g. how many named genera share a family) | Simple aggregation + feature counting | Collapsing all the way to phylum can merge a taxon that increases with a taxon that decreases into a net-null signal — always show the option, don't just default silently | — |

**Agent guidance.**

- **G1 confidence must be earned, not asserted.** If sample IDs split
  cleanly into two prefix families that also perfectly separate on read
  depth or on the batch column, that is not corroborating evidence for the
  grouping — it is a confounding red flag that belongs in G2, not a reason
  to raise G1's confidence score.
- **G2 is the gate most likely to be silently skipped by a naive
  pipeline.** Compute the batch/group cross-tab unconditionally whenever a
  `batch` column exists, even if the user hasn't asked about it — this
  mirrors Yan et al.'s finding that batch-uncorrected data produced *more*
  spurious significant hits than corrected data in a 1,462-sample CRC
  meta-analysis [Yan2025], i.e. batch confounding doesn't just add noise,
  it can look like signal.
- **G3 exists to be boring.** In the common case (independent cross-sectional
  case/control), the agent should still write a gate-note stating the
  independence check was run and what it found — silence here reads as "not
  checked," which is worse than a confirmed-clean result.
- **G4's trade should be shown, not told.** Compute and display feature
  counts at all three ranks before recommending genus; the recommendation is
  a default the user can override, not a fact.

---

## Step 3 — Raw QC

```yaml
step_id: raw_qc
page_key: qc
gate_ids: [G5]
inputs: [genus_table, group_assignment]
outputs: [depth_floor, excluded_samples, sanity_checklist]
```

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G5 | QC depth floor (screening exclusion, distinct from the rarefaction depth in Step 4) | User-adjustable slider; presets at 1,000 (permissive), 5,000 (Weiss 2017 convention), 10,000 (conservative) | 5,000 reads, citing the Weiss et al. convention, but always shown as adjustable — it is a screening convention, not a constant of nature | Sort samples by depth ascending; plot against the floor; count samples below each candidate floor per group | Threshold + count, no formal test | Setting the floor so high it disproportionately excludes one group (e.g. cases sequenced on an older, lower-output run) turns a QC step into a second, unacknowledged batch-effect gate — always report post-floor group balance, not just the total excluded count | Weiss et al. 2017 [Weiss2017] |
| — | Sanity checklist | Parsing failures, duplicate sample IDs, samples below floor | Carry every failure forward for the user to rule on, never silently drop | Re-run the Step 1 parse report; deduplicate on sample ID; flag anything below the current floor | Checklist, not a test | Auto-dropping "obviously bad" samples removes the paper trail — a failure that's silently fixed can't be audited later from the References/decision-log page | — |

**Agent guidance.** Nothing is filtered yet at this stage by design — the
mock's framing is "a sanity check before anything gets normalized, so
problems stay visible." The agent's job here is descriptive: report, don't
decide. The actual exclusion decision (which samples fall out of the
analysis) is deferred to Step 4, where it can be justified against the
rarefaction curve rather than an arbitrary floor.

---

## Step 4 — Normalization / Rarefaction

*This is the step with the least methodological consensus in the whole
pipeline. The mock treats it as a live three-way scientific debate rather
than a solved default, and this section should be read as the deepest one
in the document — the recommendation the agent makes here is inherited by
every later statistic.*

```yaml
step_id: normalization
page_key: rarefy
gate_ids: [G6, G7]
inputs: [genus_table, per_sample_library_depth, group_assignment, depth_floor]
outputs: [normalization_method, rarefaction_depth, excluded_samples, gate_note, debate_box, agent_proposal_card]
```

### 4.1 The three-way method choice (G6)

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G6 | Normalization strategy | **Rarefaction** — repeated subsampling to a common depth; **CSS** — cumulative-sum scaling, keeps every sample, assumes a shared scaling regime; **CLR** — centered log-ratio, compositionally rigorous, needs a zero-replacement rule | Rarefaction, *if and only if* the downstream question is diversity (alpha/beta) and depth heterogeneity across groups is severe enough to bias those estimators. Favor CLR/log-ratio methods (feeding ANCOM-BC/ALDEx2) once the pipeline reaches differential abundance in Step 7, regardless of what was chosen here for diversity | Per-sample depth distribution (CV of library size, min/max ratio); depth vs. group correlation; rarefaction curve plateau fraction (below) | See 4.2 for the full decision procedure | Treating this as one global choice for the whole pipeline conflates two different questions — "what depth-normalization does *diversity* estimation need" vs "what does *differential abundance* need" — and the literature answers them differently | Schloss 2024 [Schloss2024]; McMurdie & Holmes 2014 [MH2014]; Gloor et al. 2017 [Gloor2017] |

**The debate, as it actually stands in the literature** (present all three
positions in the UI's debate box — do not resolve it as if there is a
consensus, because there isn't):

- **For rarefaction.** Schloss (2024) argues the field's rejection of
  rarefaction was based on a terminology confusion between *rarefying*
  (single subsampling as a normalization step) and *rarefaction* (repeated
  subsampling, averaged) — the latter, done properly with enough
  iterations, gives the most robust control for uneven sequencing effort in
  simulation, specifically for diversity metrics [Schloss2024].
- **Against rarefaction.** McMurdie & Holmes (2014) show rarefying is
  "statistically inadmissible" for *differential abundance* specifically:
  it discards valid data, and the discarded-data cost is asymmetric — it
  inflates every sample's variance to match the worst (smallest) library in
  the set, which can erase a real, detectable difference in proportions
  [MH2014]. Their objection is explicitly about DA testing and clustering
  distances, not about diversity estimation per se.
- **Third position — the data are compositional, and neither of the above
  fixes that.** Gloor et al. (2017) argue sequencing counts are compositional
  by construction (a fixed-capacity instrument, not a count of molecules in
  the environment), so read depth carries no information beyond estimation
  precision — the correct fix is a log-ratio transform (CLR/Aitchison
  geometry) at every stage: distances, ordination, and differential
  abundance, replacing rarefied-count pipelines outright rather than
  choosing a depth [Gloor2017].

**How the agent should actually resolve this, not just report it:**

1. These three papers are not making the same claim about the same
   analysis — Schloss defends rarefaction for **diversity metrics**,
   McMurdie & Holmes attack it for **differential abundance**, and Gloor
   rejects count-based methods **entirely** in favor of a different
   geometry. The agent's job is not to pick a "winner" but to route the
   right method to the right downstream question:
   - Alpha/beta diversity (Steps 5–6): rarefaction is defensible and is
     what the mock's own page recommends, *provided* the curves actually
     plateau (see 4.2).
   - Differential abundance (Step 7): prefer ALDEx2/ANCOM-BC operating on
     CLR-transformed or compositionally-aware counts over a rarefied table,
     consistent with Gloor's argument and with the empirical finding that
     classic non-parametric tests on relative abundances are the most
     *replicable* choice across independent cohorts [Pelto2025].
2. **CSS is the middle option, and it is rarely the right default.** It
   keeps every sample (unlike rarefaction) but assumes the scaling factor
   generalizes across the whole dataset, which breaks down under the same
   high-variance/high-compositional-bias conditions where group-wise
   normalization methods have been shown to outperform it — recommend CSS
   only when the user has a specific reason to keep every sample and the
   dataset does not show extreme depth heterogeneity, and flag the
   assumption explicitly if chosen [ClarkBoucher2024].
3. **State the choice as depth-dependent, not permanent.** If forced to a
   single per-pipeline default (as the mock's UI implies, one normalization
   feeding Steps 5–7), rarefaction is the safer default for a hackathon-scale
   demo precisely because it's the most interpretable to a non-specialist
   reviewer, but the gate-note must say explicitly that a compositionally
   rigorous DA step downstream would use a different transform.

### 4.2 Rarefaction depth threshold (G7 — only applies if rarefaction is chosen)

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G7 | Rarefaction depth | Any value on [min viable depth, min(library depths retained)] | The depth at which rarefaction curves plateau for the large majority of samples (mock example: 22/24), computed — not guessed | Draw richness-vs-reads-sampled curves per sample (Michaelis-Menten-style saturation fit); compute each sample's plateau point (e.g. 95% of asymptotic richness) | Curve-fitting + plateau-detection, not a fixed number | Picking a depth by "convention" (5,000, 10,000) instead of from the actual curves either wastes power (needlessly high) or leaves richness under-sampled (too low) — the number must be derived from *this* dataset's curves, not carried over from a different one | Schloss 2024 [Schloss2024] |

**The decision algorithm** (this is what the "Reviewer proposal" agent card
in the mock is doing, and it should be reproducible, not hand-picked):

1. Fit a saturation curve (e.g. Michaelis-Menten richness model) to each
   sample's rarefaction curve.
2. Define "plateaued at depth *d*" as observed richness at *d* reaching
   some fraction (e.g. ≥95%) of the fitted asymptote.
3. Choose the smallest *d* at which the plateaued-sample fraction crosses a
   pre-declared threshold (e.g. ≥90% of samples) — this is a genuine
   power/inclusion trade-off and should be shown as a slider, not hidden.
4. Samples whose depth is below *d* are **excluded**, not padded or
   imputed. State exactly which samples and why (e.g. "H-09 and C-04 stay
   below the line and are excluded, rather than forcing the whole cohort
   down to their depth" — excluding two shallow samples to protect the
   statistical power of the other 22 is the right trade in most cases, but
   say so explicitly rather than letting the number silently do the work).
5. **Always check exclusions for group imbalance.** If depth correlates
   with group (a common artifact of running cases and controls on
   different sequencing runs), a "principled" depth choice can
   systematically strip one group — this is the same failure mode as G2,
   surfacing again at a different gate, and should trigger the same
   batch-effect language.
6. Report the number of rarefaction iterations averaged (repeated
   subsampling, per Schloss's terminology correction — a single-pass
   subsample is "rarefying" and is the thing McMurdie & Holmes correctly
   object to; averaging over many iterations is "rarefaction" and behaves
   differently) [Schloss2024] [MH2014].

**Agent guidance for the whole step.** This is the one page in the pipeline
where the agent should actively argue against its own proposal before
asking for approval (the mock's "Question the depth choice" reveal) —
generate at least one concrete objection (e.g., "raising the depth
threshold to 6,000 would additionally exclude H-06 and C-03, which sit just
under that line — is 22/24 retained an acceptable trade against a possibly
cleaner curve fit?") rather than only defending the number it already
picked.

---

## Step 5 — Alpha Diversity

```yaml
step_id: alpha_diversity
page_key: alpha
gate_ids: [G8]
inputs: [rarefied_table, group_assignment, significance_settings]
outputs: [composition_chart, alpha_metrics_table, dumbbell_plot, expectation_check]
```

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G8 | Significance level | 0.01 (strict) / 0.05 (convention) / 0.10 (exploratory) | 0.05 | — (this is a policy choice, not data-derived) | — | Set once here because this is the first page with a p-value on it — it must stay identical (and editable from the same context strip) through Beta and DA, or the run's significance claims become internally inconsistent | — |
| G8 | Multiple-testing correction | Benjamini-Hochberg (controls FDR) / Bonferroni (controls FWER) / none (raw p) | BH — appropriate default for the number of simultaneous comparisons typical here (5 alpha metrics × groups; scales to hundreds of taxa at DA) | Count the number of simultaneous tests this correction will need to span (metrics now, taxa later at Step 7) | — | Choosing "none" without a strong justification, or applying Bonferroni to hundreds of taxa (needlessly conservative, buries real hits) — BH is the standard for exploratory microbiome differential testing | — |
| — | Which metrics to report | Observed richness, Shannon, Simpson, Chao1, Pielou's evenness | Report all five — they answer different questions (raw count vs. entropy vs. dominance vs. estimated true richness vs. evenness) and disagreement between them is itself informative | Compute all five per sample from the rarefied table (or rarefaction-averaged, per Step 4's iteration count) | Wilcoxon rank-sum per metric (independent-samples default from G3), corrected per G8 | Reporting only Shannon (the most common single metric) hides direction-specific signals — e.g. richness up but evenness flat is a different biological story than both moving together | — |

**Agent guidance.**

- **Composition before metrics, deliberately.** The mock sequences this
  page as composition chart first, summary metrics second, because the
  metrics are "easy to over-read on their own" — a single Shannon p-value
  invites a stronger causal story than the data supports. Keep that
  ordering in the agent prompt: describe *what's there* before *whether
  it's different*.
- **Actively check against the naive prior, and say so when it's wrong.**
  A common expectation is that a disease state (e.g. CRC) shows *globally
  reduced* diversity. If richness trends flat or even slightly higher while
  Shannon is non-significant, do not force that into the "lower diversity"
  narrative — say explicitly that this is an expectation mismatch, and that
  the literature supports taxon-specific enrichment as an alternative
  mechanism that doesn't show up as a global diversity loss [Thomas2019].
  This kind of explicit mismatch flag is exactly the "skeptical reviewer"
  behavior the product is named for — an agent that reports what a prior
  predicted, and whether the data agreed, is more useful than one that only
  reports significance.
- **Direction over p-value.** Instruct the agent to always state which way
  an effect points before stating whether it's significant — a
  non-significant trend in the "wrong" direction from a strong prior is
  more informative to flag than a significant one in the expected
  direction.

---

## Step 6 — Beta Diversity

```yaml
step_id: beta_diversity
page_key: beta
gate_ids: [G9]
inputs: [rarefied_table, group_assignment, significance_settings, phylogenetic_tree_optional]
outputs: [distance_matrix, pcoa_plot, permanova_result, betadisper_result]
```

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G9 | Distance metric | **Bray-Curtis** (abundance-weighted, common taxa dominate) / **Jaccard** (presence-absence only, rare taxa weigh more) / **Aitchison** (log-ratio geometry, required if CLR was used) / **UniFrac** (needs a phylogenetic tree — disabled without one) | Bray-Curtis, the conventional choice for abundance-weighted amplicon comparisons absent a specific reason to weight differently | Check whether a phylogenetic tree was supplied (enables/disables UniFrac); check sparsity (favors Jaccard if the question is really about presence/absence of rare taxa); check whether Step 4 chose CLR (then Aitchison is the *required* pairing, not optional) | PERMANOVA (permutational MANOVA) on the chosen distance, 999 permutations; betadisper for dispersion homogeneity | Picking Bray-Curtis by default even when Step 4 used a CLR transform pairs an abundance-weighted, non-compositional distance with a compositional normalization — Aitchison is the geometrically consistent partner for CLR, not a free extra option | Bray & Curtis 1957 [BrayCurtis1957]; Anderson 2001 [Anderson2001] |
| — | Interpreting PERMANOVA | Report R² and p together, never p alone | — | Compute betadisper alongside PERMANOVA every time | PERMANOVA (Anderson 2001); betadisper (dispersion homogeneity test) | A significant PERMANOVA p-value with a small R² (e.g. 0.038) means groups differ *reliably* but *only slightly* — reporting "significant separation" without the R² implies a much stronger effect than exists. Also: PERMANOVA is sensitive to unequal *dispersion*, not just location — if betadisper is itself significant, the PERMANOVA result may reflect unequal spread rather than a true group-centroid shift, and that caveat must be stated, not omitted | Anderson 2001 [Anderson2001] |

**Agent guidance.**

- **Never report PERMANOVA p without R² and betadisper.** The three
  numbers form one claim: "groups differ" (p), "by how much" (R²), and
  "is that a location shift or unequal variance" (betadisper). Reporting
  any one alone is a common way beta-diversity results get overstated in
  the literature — the agent should be trained to treat this as a hard
  reporting requirement, not an optional detail.
- **A small R² is a hand-off, not a dead end.** State explicitly that a
  small-but-significant PERMANOVA effect motivates the next page
  (differential abundance) rather than closing the question — the
  community-level test says *something* differs; only taxon-level testing
  says *what*.
- **UniFrac's unavailability should be explained, not just grayed out.**
  If no phylogenetic tree was supplied at Upload, say so plainly in the
  gate-note rather than silently disabling the option — a reviewer should
  know a phylogenetically-aware option existed and wasn't available, not
  just that it wasn't offered.

---

## Step 7 — Differential Abundance

```yaml
step_id: differential_abundance
page_key: da
gate_ids: [G10]
inputs: [genus_table, group_assignment, significance_settings, known_taxa_reference]
outputs: [volcano_plot, consensus_calls, known_taxa_crosscheck, artifact_warnings]
```

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G10 | Prevalence filter | No filter / 5% (permissive) / 10% (recommended) / 20% (strict) | 10% — detected in at least 1 in 10 samples | Compute per-taxon prevalence (fraction of samples with non-zero count) before filtering; show how many taxa and how many tests are removed at each threshold | Simple prevalence threshold, applied before correction | Taxa detected in very few samples add tests (and therefore correction burden) without adding evidence — but filtering too aggressively (20%+) can remove a taxon that is rare-but-real and clinically relevant (e.g. an opportunistic pathogen). Always report what was filtered out by name, not just the count | Agronah & Bolker 2025 [Agronah2025] (typical microbiome DA studies are underpowered per-taxon; unnecessary tests worsen this) |
| — | Method choice for the DA test itself | ALDEx2 (CLR-based, models compositional uncertainty) / ANCOM-BC (bias-corrected log-ratio) / Wilcoxon on relative abundance (simple, and per recent benchmarking, one of the most *replicable* choices) — run all three and require agreement | Consensus of ≥2 of 3 methods; do not report a single-method call as a finding | Run all three on the (post-prevalence-filter) table; tabulate per-taxon method agreement | ALDEx2, ANCOM-BC, Wilcoxon rank-sum — agreement-based consensus, not a single "best" method | Differential abundance tools disagree substantially on the same data — a single-method hit is not evidence on its own. This is not a hypothetical: recent large-scale benchmarks confirm only a handful of methods properly control false discoveries even before considering confounders, and that simple nonparametric tests on relative abundances are among the most *reproducible* across independent datasets — which argues for requiring cross-method agreement rather than trusting any one tool's internal significance threshold | Wirbel et al. 2024 [Wirbel2024]; Pelto et al. 2025 [Pelto2025]; Nearing et al. 2022 [Nearing2022] |
| — | Known-taxa cross-check | Route consensus hits through a literature reference table rather than scoring them as "correct"/"incorrect" | For each hit, record: literature direction (up/down/unreported), this run's direction, and a status (confirmed / missing / novel) | Build the reference table from the specific disease area's literature via paperclip (do not hardcode a fixed genus list — CRC's known-enriched genera are not IBD's) | Table lookup / concordance reporting, not a formal statistical test | Treating "matches the literature" as the goal inverts the actual purpose — an expected taxon that is *missing* here is exactly as informative as one that is confirmed, since it can mean the effect isn't present in this cohort, the study is underpowered for it, or a confounder (Step 2, G2) suppressed it | Yan et al. 2025 [Yan2025] (CRC-specific example: Fusobacterium and Enterobacter consistently enriched in cases; Bacteroides and Faecalibacterium consistently enriched in healthy controls, across a 1,462-sample multi-cohort meta-analysis); Queen et al. 2025 [Queen2025] (mechanistic support specifically for Fusobacterium nucleatum enrichment in CRC) |
| — | Artifact scanning | Flag findings whose statistical support is fragile (e.g. called by 2 methods but driven by very low prevalence, or a large fold-change built on a handful of non-zero samples) | Always run; never silently suppress a flagged finding, surface it for the user to acknowledge | Cross-reference each hit's prevalence, effect size, and method-agreement count; flag combinations like "high fold-change + low prevalence + only 2/3 methods" | Rule-based flagging, not a p-value | The agent does not know which findings are real — its job is to flag fragile support, not adjudicate it. Acknowledging a flag must be logged as a distinct decision-log entry (a human ruling), not silently cleared | — |

**Agent guidance.**

- **Order matters: consensus → cross-check → artifact scan.** Each stage
  narrows differently. Consensus removes single-method noise. The
  cross-check contextualizes hits against prior literature (for *this*
  disease area, fetched via paperclip, not memorized). The artifact scan
  catches the specific way consensus can still be wrong — e.g. two
  parametric methods agreeing because they share the same failure mode on
  sparse data, not because the signal is real.
- **The known-taxa table is disease-area-specific and must be fetched, not
  hardcoded.** For a CRC run, `paperclip search`/`grep` the specific genera
  found significant in *this* run against recent CRC meta-analyses; for an
  IBD or CDI run (also in `data/MicrobiomeHD/`), the reference set is
  entirely different literature. This is exactly the place in the pipeline
  where the agent should be actively querying paperclip mid-analysis, not
  just at the final References page.
- **Fold-change direction and magnitude both need a sanity check against
  prevalence.** A large log-fold-change on a taxon present in 8% of samples
  is a different kind of claim than the same fold-change on a taxon present
  in 90% — the volcano plot's marker size (method agreement count) should
  be read alongside prevalence, and the agent's narrative should say so
  rather than only citing the fold-change.

---

## Step 8 — Run Summary & References

```yaml
step_id: run_summary
page_key: refs
gate_ids: []
inputs: [decision_log, all_citations_used, all_gate_notes]
outputs: [reference_list, decision_timeline, reproducibility_checklist, downloadable_artifacts]
```

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| — | Reference compilation | Group citations by which decision they support (not by page or chronology) | Group by decision (G1..G10 plus method citations), so a reader can audit one gate's justification without reading the whole log | Walk the decision log; for every claim that carried a citation, re-resolve it live via `paperclip lookup doi` and pull the exact line(s) relied on | `paperclip` citation resolution, per the citation policy above | Citing a paper by title/DOI without re-confirming the specific line supports the specific claim made — citations rot as this document (and the agent's memory of it) age; the References page must reflect what was actually verified *for this run*, not a copy-pasted bibliography | — |
| — | Decision log entries | Agent proposal vs. user override, both logged in order | Every gate produces exactly one log entry per decision, plus one more if the user overrides the agent's default | Timestamp + gate ID + agent proposal + confidence + (if applicable) user override + reason | Append-only log | Omitting agent-proposed-but-user-overridden decisions from the log erases exactly the information a collaborator most needs — what the reviewer *would have done* by default | — |
| — | Reproducibility checklist | Record every numeric parameter that was chosen rather than computed (depth floor, rarefaction depth, alpha, correction method, prevalence filter, distance metric) | All of them, with their source (default / agent-recommended-and-accepted / user-overridden) | Pull directly from the decision log rather than recomputing | Checklist | A run that can't be reproduced from this page's export (`RUN.JSON`) without re-running the pipeline interactively has failed the product's core premise — "what a collaborator should be able to read instead of re-running the pipeline" | — |

**Agent guidance.** This page is not a summary in the sense of
"restate what happened" — it's the artifact that makes every prior decision
independently auditable. The bar: a collaborator who was not in the room for
any of Steps 2–7 should be able to read this page and (a) know exactly what
was decided and why, (b) know what the agent recommended versus what the
human actually chose, and (c) re-run the identical analysis from the
`RUN.JSON` export without guessing a single parameter.

---

## Reference Appendix

### Tier A — paperclip-verified (2026-08-15)

| Key | Citation | Source |
|---|---|---|
| `Schloss2024` | Schloss PD. Rarefaction is currently the best approach to control for uneven sequencing effort in amplicon sequence analyses. *mSphere* (2024). doi:10.1128/msphere.00354-23 | PMC10900887 |
| `MH2014` | McMurdie PJ, Holmes S. Waste Not, Want Not: Why Rarefying Microbiome Data Is Inadmissible. *PLoS Comput Biol* (2014). doi:10.1371/journal.pcbi.1003531 | PMC3974642 |
| `Gloor2017` | Gloor GB, Macklaim JM, Pawlowsky-Glahn V, Egozcue JJ. Microbiome Datasets Are Compositional: And This Is Not Optional. *Front Microbiol* (2017). doi:10.3389/fmicb.2017.02224 | PMC5695134 |
| `Wirbel2024` | Wirbel J, Essex M, Forslund SK, Zeller G. A realistic benchmark for differential abundance testing and confounder adjustment in human microbiome studies. *Genome Biol* (2024). doi:10.1186/s13059-024-03390-9 | PMC11423519 |
| `Pelto2025` | Pelto J, Auranen K, Kujala JV, Lahti L. Elementary methods provide more replicable results in microbial differential abundance analysis. *Brief Bioinform* (2025). doi:10.1093/bib/bbaf130 | PMC11937625 |
| `Agronah2025` | Agronah M, Bolker B. Investigating statistical power of differential abundance studies. *PLoS ONE* (2025). doi:10.1371/journal.pone.0318820 | PMC11978113 |
| `Yan2025` | Yan R, Zheng R, Han Y, Song G, Huo B, Sun H. Meta-analysis of gut microbiome reveals patterns of dysbiosis in colorectal cancer patients. *J Med Microbiol* (2025). doi:10.1099/jmm.0.002042 | PMC12309989 |
| `Queen2025` | Queen J, et al. Fusobacterium nucleatum is enriched in invasive biofilms in colorectal cancer. *bioRxiv* (2025). doi:10.1101/2024.12.30.630810 | PMC11722383 |
| `ClarkBoucher2024` | Clark-Boucher D, Coull B, Reeder HT, Wang F, Sun Q, Starr JR, Lee KH. Group-wise normalization in differential abundance analysis of microbiome samples. Preprint (2024). | PMC11812596 |

### Tier B — standard field references (not resolved in the paperclip corpus at compile time; verify DOI/venue independently before use)

| Key | Citation |
|---|---|
| `BrayCurtis1957` | Bray JR, Curtis JT. An ordination of the upland forest communities of southern Wisconsin. *Ecol Monogr* 27:325–349 (1957). doi:10.2307/1942268 |
| `Anderson2001` | Anderson MJ. A new method for non-parametric multivariate analysis of variance. *Austral Ecology* 26:32–46 (2001). doi:10.1111/j.1442-9993.2001.01070.x |
| `Anderson2006` | Anderson MJ. Distance-based tests for homogeneity of multivariate dispersions. *Biometrics* 62:245–253 (2006). |
| `BH1995` | Benjamini Y, Hochberg Y. Controlling the false discovery rate: a practical and powerful approach to multiple testing. *J R Stat Soc B* 57:289–300 (1995). |
| `Lozupone2005` | Lozupone C, Knight R. UniFrac: a new phylogenetic method for comparing microbial communities. *Appl Environ Microbiol* 71:8228–8235 (2005). |
| `Chao1984` | Chao A. Non-parametric estimation of the number of classes in a population. *Scand J Stat* 11:265–270 (1984). |
| `Pielou1966` | Pielou EC. The measurement of diversity in different types of biological collections. *J Theor Biol* 13:131–144 (1966). |
| `Aitchison1986` | Aitchison J. *The Statistical Analysis of Compositional Data.* Chapman & Hall (1986). |
| `Paulson2013` | Paulson JN, Stine OC, Bravo HC, Pop M. Differential abundance analysis for microbial marker-gene surveys. *Nat Methods* 10:1200–1202 (2013). (CSS / metagenomeSeq) |
| `Fernandes2014` | Fernandes AD, et al. Unifying the analysis of high-throughput sequencing datasets: characterising RNA-seq, 16S rRNA gene sequencing and selective growth experiments by compositional data analysis. *Microbiome* 2:15 (2014). (ALDEx2) |
| `LinPeddada2020` | Lin H, Peddada SD. Analysis of compositions of microbiomes with bias correction. *Nat Commun* 11:3514 (2020). (ANCOM-BC) |
| `Nearing2022` | Nearing JT, et al. Microbiome differential abundance methods produce different results across 38 datasets. *Nat Commun* 13:342 (2022). |
| `Weiss2017` | Weiss S, et al. Normalization and microbial differential abundance strategies depend upon data characteristics. *Microbiome* 5:27 (2017). |
| `Willis2019` | Willis AD. Rarefaction, Alpha Diversity, and Statistics. *Front Microbiol* 10:2407 (2019). |
| `McKnight2019` | McKnight DT, et al. Methods for normalizing microbiome data: An ecological perspective. *Methods Ecol Evol* 10:389–400 (2019). |
| `Thomas2019` | Thomas AM, et al. Metagenomic analysis of colorectal cancer datasets identifies cross-cohort microbial diagnostic signatures and a link with choline degradation. *Nat Med* 25:667–678 (2019). doi:10.1038/s41591-019-0405-7 |
