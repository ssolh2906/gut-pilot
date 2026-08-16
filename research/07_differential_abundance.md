## Step 7 — Differential Abundance

```yaml
step_id: differential_abundance
page_key: da
gate_ids: [G10]
inputs:
  - genus_table_raw_counts
  - group_assignment
  - study_design
  - significance_settings
  - optional_covariates
  - optional_subject_id
  - disease_or_exposure_context
outputs:
  - prevalence_report
  - method_results
  - consensus_calls
  - effect_size_table
  - volcano_plot
  - known_taxa_crosscheck
  - artifact_warnings
  - biological_interpretation
  - literature_evidence_table
  - gate_note
```

### Scientific purpose

Differential abundance (DA) asks the taxon-level question that follows the community-level analyses in Steps 5–6:

> **Which microbial taxa differ between the biological groups or conditions being compared, in what direction, by how much, and how robust is that conclusion to reasonable statistical choices?**

The scientific goal is not to manufacture a list of significant genera. The goal is to identify candidate organisms or ecological shifts that could plausibly explain the broader microbiome phenotype and generate experimentally testable hypotheses.

Interpret DA in the context of the study's unit of comparison. For example:

- **disease vs control:** which taxa are enriched or depleted with disease and could represent disease-associated ecology, biomarkers, or mechanistic candidates?
- **drug vs untreated / pre vs post treatment:** which taxa change with exposure and could represent pharmacomicrobiomic response, toxicity, metabolism, or ecological perturbation?
- **responder vs non-responder:** which taxa distinguish treatment response and could motivate predictive or mechanistic follow-up?
- **longitudinal intervention:** which taxa change within subjects after intervention, rather than merely differing between people?
- **environment / diet / genotype:** which organisms are associated with the exposure while accounting for the study design and measured confounders?

DA establishes **association, not causation**. A taxon enriched in disease could contribute to disease, flourish because the disease environment changed, track an unmeasured exposure, or appear different because another organism changed in a compositional system. The agent must distinguish these interpretations.

### Relationship to Steps 5–6

Treat the three diversity stages as different levels of the same scientific argument:

1. **Alpha diversity:** does the within-sample ecological structure differ?
2. **Beta diversity:** does the overall community composition differ between groups?
3. **Differential abundance:** which taxa are candidate contributors to that difference?

DA remains informative even when alpha or beta diversity is null: a small number of taxa can shift strongly while global diversity remains similar. Conversely, a significant beta-diversity result does not guarantee that individual taxa will survive multiplicity correction.

---

### Decision table

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G10 | Prevalence filtering | No filter / 5% / 10% / 20% / data-informed override | **10% as the starting default**, then inspect sensitivity. Retain a rarer taxon only when biologically prespecified or when the dataset is large enough to support it. | Per-taxon prevalence overall **and by group**; number of taxa retained at 0/5/10/20%; number of non-zero samples per group; flag taxa occurring almost exclusively in one group. | Pre-specified prevalence threshold before multiplicity correction. | Rare features inflate the testing burden and produce unstable effect estimates, but a global prevalence filter can also remove a genuine group-specific organism. Never filter solely because a taxon is absent from one group; report taxa removed near the threshold. | [Nearing2022]; [Agronah2025] |
| — | Statistical design carried into DA | Unadjusted two-group comparison / covariate-adjusted model / paired or repeated-measures model / batch-adjusted model | **Inherit Step 2, never reset to a naive two-group test.** If confounders or repeated subjects were identified, use DA methods that can represent them. | Re-read G1–G3; tabulate group × batch/covariates; verify subject IDs; check sample counts per group and per subject. | Design matrix / model formula; subject-aware or repeated-measures analysis where applicable. | Running a statistically sophisticated compositional method with the wrong design still answers the wrong question. Batch, age, treatment, site, or repeated sampling can create apparent taxon effects. | [LinPeddada2024]; [Wirbel2024] |
| — | Primary DA methods | **ANCOM-BC2** when covariates, multiple groups, repeated measures, or bias correction are important; **ALDEx2** as a conservative compositional cross-check for suitable designs; **simple rank-based analysis** as a transparent sensitivity analysis when compatible with the design. | **Use ANCOM-BC2 as the primary inferential model when the study design requires adjustment; add ALDEx2 and a transparent non-parametric sensitivity analysis when their assumptions/design capabilities fit. Do not force all datasets through the same three tests.** | Sparsity; prevalence; zero structure; library-size distribution; study design; convergence/errors; effect directions across methods. | Method-specific compositional DA with BH/FDR correction. For simple independent two-group sensitivity analyses, use Wilcoxon on clearly specified abundance representation; for paired data use a paired/subject-aware alternative rather than ordinary rank-sum. | A fixed “2 of 3 = truth” rule is not scientifically guaranteed: methods can share failure modes and may test different estimands. Cross-method agreement is a **robustness grade**, not a second p-value. | [Nearing2022]; [Wirbel2024]; [LinPeddada2024]; [Pelto2025] |
| — | Significance and effect reporting | q-value only / effect only / both | **Require both statistical evidence and interpretable effect information.** Use the run-wide FDR policy from G8; report q-value, effect direction, method-specific effect estimate, prevalence by group, and uncertainty where available. | Inspect effect-size distribution; group prevalence; abundance distributions for candidate hits; sample size supporting each estimate. | BH/FDR within the prespecified DA testing family; method-specific confidence intervals when available. | A tiny but highly significant difference can be biologically trivial; a huge fold change can be generated by a handful of non-zero samples. P/q-values alone are not biological importance. | [BH1995]; [Wirbel2024] |
| — | Robustness / consensus classification | Primary-method supported / cross-method supported / method-sensitive / unsupported | **Classify rather than binary-vote.** Highest confidence = directionally consistent, FDR-supported by the primary design-appropriate method and supported by at least one valid sensitivity method. | Harmonize taxon names and effect directions; compare significance and rank across valid methods; identify methods that could not represent the study design. | Concordance table; rank/effect-direction comparison. | Counting agreement across methods that do not model the same design gives false reassurance. Never count an invalid method as a vote. | [Nearing2022]; [Wirbel2024] |
| — | Known-taxa / prior-literature cross-check | Confirmed / direction-discordant / previously reported but not detected / apparently novel / insufficient literature | **Contextualize only after the statistical results are frozen.** Search the disease/exposure literature for the strongest current DA hits and a small set of prespecified expected taxa. | Freeze the hit table first; identify disease/exposure, sample type, sequencing modality, taxonomic rank, and direction of each candidate. | Targeted literature retrieval and evidence table, not a statistical test. | Searching literature before freezing calls encourages confirmation bias. “Previously reported” is not proof; “novel” means not found in the targeted search, not never reported. | Disease-specific evidence retrieved at runtime |
| — | Artifact / fragility scan | Clean / low-prevalence / outlier-driven / batch-linked / method-sensitive / taxonomically ambiguous | **Always run and never silently delete a hit.** | Per-group prevalence; sample-level abundance plot; leave-one-out or influential-sample check for leading hits; batch/site distribution; taxonomic assignment quality; method agreement. | Rule-based warnings plus targeted sensitivity analyses. | The most dramatic volcano-plot point can be a sparse taxon, a single outlier, a batch marker, or an ambiguous 16S assignment. The agent flags fragility; the human decides whether it changes the conclusion. | [Wirbel2024] |

---

## Agent decision procedure

### 1. Reconstruct the scientific comparison before testing taxa

Before running DA, state in one sentence:

> **We are testing whether genus abundance differs between [GROUP A] and [GROUP B] in [SAMPLE TYPE], interpreted as [disease / exposure / intervention / response] associated differences, while accounting for [covariates / batch / repeated subjects].**

If this sentence cannot be written from the metadata and approved Study Design decisions, stop and request human clarification. Do not infer the biological meaning from sample IDs.

### 2. Inherit the study design

DA must consume the decisions from Step 2:

- group definition;
- batch/site variables;
- subject/pairing structure;
- relevant measured covariates;
- taxonomic rank.

**Subject clustering / pairing is not optional when repeated samples exist.** An ordinary Wilcoxon rank-sum or unrestricted model must not be used as if repeated samples were independent.

If group and batch/site are nearly or perfectly confounded, state that the biological group effect may not be identifiable. Statistical adjustment cannot magically separate variables with no overlap. This may require a sensitivity analysis excluding a problematic batch or may prevent a defensible DA claim entirely.

### 3. Filter sparsity transparently

Compute prevalence overall and separately within each group before filtering. Start at 10% prevalence because it is a common and defensible sparsity reduction used in DA benchmarking, but treat it as a policy choice rather than a biological constant.

For each candidate threshold (0%, 5%, 10%, 20%), report:

- taxa retained / removed;
- effective number of tests;
- any taxa with strong group-specific presence that would be lost;
- whether conclusions for leading hits are sensitive to the threshold.

Do not use prevalence filtering to erase a taxon simply because it occurs only in one biological group. Such a pattern may be scientifically interesting, but its inferential stability must be treated cautiously.

### 4. Choose methods based on the design, not a ritualized fixed panel

The pipeline should not blindly run three methods and treat majority vote as ground truth.

**Primary analysis:**

- Prefer **ANCOM-BC2** when covariate adjustment, multiple groups, repeated measures, or explicit compositional bias correction are required.
- Use **ALDEx2** as a conservative compositional sensitivity analysis when the study design can be represented appropriately [Fernandes2014].
- Use a simple rank-based analysis as a transparent sensitivity analysis only when compatible with the design. For independent two-group data this may be Wilcoxon rank-sum; for paired/repeated data use the corresponding paired or subject-aware analysis.

The reason to use multiple valid approaches is **robustness to modeling choice**, not to create an artificial voting theorem. Nearing et al. showed that DA tools can produce substantially different sets of findings and recommended consensus/multi-method reporting; later benchmarks reinforce that method behavior depends on sparsity, confounding, effect structure, and the target estimand [Nearing2022] [Wirbel2024].

### 5. Report effect, uncertainty, prevalence, and evidence together

For every leading taxon, build one row containing at minimum:

| Field | Meaning |
|---|---|
| Taxon | Genus / working rank |
| Direction | Enriched in A or B |
| Effect estimate | Method-appropriate log fold change / CLR difference / abundance contrast |
| q-value | FDR-adjusted evidence from the primary method |
| Prevalence A / B | Fraction of samples detected in each group |
| Median abundance A / B | Descriptive scale for wet-lab interpretation |
| Sensitivity support | Which valid alternative methods support the same direction |
| Fragility flags | Sparse / outlier / batch / method-sensitive / ambiguous taxonomy |
| Prior literature | Confirmed / discordant / unreported / insufficient evidence |

A volcano plot is a navigation tool, not the scientific result. The table above is the result.

### 6. Convert statistical hits into biological hypotheses

For each high-confidence taxon, the agent should ask:

1. **What changed?** Which group has more/less of the organism, and how large is the contrast?
2. **How widespread is it?** Is this a cohort-wide abundance shift or a signal carried by a minority of subjects?
3. **Does it help explain the earlier community-level result?** Is it a plausible contributor to the beta-diversity shift, or is it interesting despite little global separation?
4. **What biological role is plausible?** Is there evidence for metabolism, host interaction, inflammation, drug metabolism, colonization resistance, or another relevant function?
5. **What alternative explanation remains?** Medication, diet, age, site, sequencing batch, stool consistency, disease severity, or compositional displacement by another organism?
6. **What experiment would distinguish these explanations?** Targeted qPCR, culture, shotgun metagenomics, metabolomics, longitudinal sampling, perturbation experiments, or an independent cohort.

Mechanistic claims require mechanistic evidence. 16S genus-level DA alone should normally produce language such as **“associated with,” “enriched in,” “candidate mediator,” or “hypothesis-generating,”** not “causes” or “drives.”

### 7. Literature retrieval — Paperclip/Paperpile strategy

Use the connected literature retrieval tool configured for the product (referred to here as **Paperclip/Paperpile**) only after the statistical calls are frozen. The objective is **high-value targeted retrieval**, not an expensive open-ended literature review.

Use this resource-efficient sequence:

1. **One anchor search for the biological comparison.** Query: `[disease/exposure] microbiome meta-analysis [sample type]` and prioritize recent systematic reviews/meta-analyses or large multi-cohort studies.
2. **One method search only when a methodological decision needs support.** Prefer the original method paper plus one modern independent benchmark; do not retrieve five papers saying the same thing.
3. **Taxon-specific searches only for the leading findings.** Search the top robust taxa and any important expected-but-missing taxa, ideally batching several taxa into one query where supported.
4. **Prefer evidence hierarchy:** meta-analysis / multi-cohort replication → independent cohort → mechanistic human/animal/in-vitro evidence → narrative review.
5. **Stop when the claim is supported.** For routine context, 1–2 strong independent sources per claim are enough. Spend additional retrieval only on surprising, novel, or direction-discordant findings.
6. **Resolve exact support before citing.** Retrieve the DOI/full record and the exact passage/line supporting direction, cohort, or mechanism. Never cite a paper merely because its title sounds relevant.
7. **Record negative searches honestly.** If no convincing prior report is found after the anchor + targeted search, label the result `apparently unreported in targeted search`, not `novel`.

The literature agent should return a compact evidence object:

```yaml
taxon: Fusobacterium
claim: enriched in CRC relative to controls
evidence_level: meta_analysis_or_multicohort
source: <resolved citation>
support: <exact retrieved passage>
cohort_match: high|medium|low
notes: <important differences in sample type, geography, sequencing, etc.>
```

### 8. Known-taxa cross-check without confirmation bias

Freeze the DA table before looking up disease-specific expected taxa. Then create three scientifically distinct lists:

- **Replicated signals:** this dataset agrees in direction with strong prior evidence.
- **Expected but absent/discordant signals:** prior evidence predicts a taxon but this cohort does not reproduce it or points the other way.
- **Potentially new signals:** robust in this dataset but not found in the targeted literature search.

All three are informative. The agent must not score the analysis by how closely it reproduces the literature.

### 9. Fragility checks for leading findings

For every taxon that will appear in the biological narrative, inspect the underlying sample distribution. At minimum flag:

- prevalence close to the filtering threshold;
- extreme abundance driven by one/few samples;
- group-specific detection with very small absolute counts;
- concentration within one batch/site;
- loss of significance or reversal across reasonable methods;
- ambiguous or low-confidence taxonomic assignment;
- major sensitivity to the prevalence threshold.

Where computationally feasible, perform a simple leave-one-sample-out or leave-one-subject-out stability check for the top few findings. This is a **sensitivity diagnostic**, not a replacement inferential test.

---

## Required wet-lab-facing result

The final page must translate the statistics into a short research conclusion a wet-lab scientist can act on. Use this structure:

> **Scientific question.** We tested which genera differed between [A] and [B], accounting for [design factors].
>
> **Main finding.** [N] taxa showed robust evidence of differential abundance at FDR < [q], of which [N] were supported by at least one valid sensitivity method. The strongest signal was [TAXON], which was [higher/lower] in [GROUP], with [prevalence/abundance summary].
>
> **Community context.** These taxon-level shifts [are consistent / are not obviously consistent] with the Step 6 beta-diversity result because [brief explanation].
>
> **Prior evidence.** [N] leading taxa agree with prior [disease/exposure] literature; [N] expected taxa were not reproduced; [N] robust signals were not found in the targeted prior search.
>
> **Interpretation.** The data support an association between [biological condition] and specific microbial changes rather than proving a causal microbial mechanism.
>
> **Best next experiment.** [Concrete validation: qPCR / shotgun metagenomics / metabolomics / longitudinal validation / independent cohort / culture or perturbation], chosen to test the most plausible biological interpretation and distinguish it from the leading alternative explanation.

If no taxa survive correction, do not call the analysis a failure. State whether the data support (a) no detectable taxon-level differences at the available power, (b) community-level changes distributed across many weak taxa, or (c) unstable signals limited by sparsity/sample size. Recommend the next experiment accordingly.

---

## Hard guardrails

- Never run DA on the rarefied diversity table merely because Step 4 used rarefaction. Start from the raw integer count table and use each DA method's appropriate input/normalization.
- Never ignore G2/G3 study-design decisions when entering DA.
- Never treat `2 of 3 methods` as mathematical proof; use cross-method support as a robustness label.
- Never report q-values without effect direction and prevalence.
- Never infer causality from differential abundance.
- Never call a taxon `novel` solely because the agent did not immediately retrieve a paper.
- Never use prior literature to alter significance thresholds or selectively rescue a non-significant expected organism.
- Never hide method disagreement, expected-but-missing taxa, or fragility flags.
- Never count a sensitivity method as supporting evidence if it cannot represent the actual paired/covariate-adjusted study design.

---

## Evidence keys for this step

- `[Nearing2022]` Nearing JT et al. *Microbiome differential abundance methods produce different results across 38 datasets.* Nature Communications 13, 342 (2022). doi:10.1038/s41467-022-28034-z.
- `[Fernandes2014]` Fernandes AD et al. *Unifying the analysis of high-throughput sequencing datasets: characterizing RNA-seq, 16S rRNA gene sequencing and selective growth experiments by compositional data analysis.* Microbiome 2, 15 (2014). PMID 24910773. doi:10.1186/2049-2618-2-15. (ALDEx2)
- `[LinPeddada2024]` Lin H, Peddada SD. *Multigroup analysis of compositions of microbiomes with covariate adjustments and repeated measures.* Nature Methods 21, 83–91 (2024). doi:10.1038/s41592-023-02092-7. (ANCOM-BC2)
- `[Wirbel2024]` Wirbel J et al. *A realistic benchmark for differential abundance testing and confounder adjustment in human microbiome studies.* Genome Biology (2024). doi:10.1186/s13059-024-03390-9.
- `[Pelto2025]` Pelto J et al. *Elementary methods provide more replicable results in microbial differential abundance analysis.* Briefings in Bioinformatics (2025). doi:10.1093/bib/bbaf130.
- `[Agronah2025]` Agronah M, Bolker B. *Investigating statistical power of differential abundance studies.* PLOS ONE (2025). doi:10.1371/journal.pone.0318820.
- `[BH1995]` Benjamini Y, Hochberg Y. *Controlling the false discovery rate: a practical and powerful approach to multiple testing.* JRSS B 57:289–300 (1995).

