## Step 8 — Scientific Synthesis, Literature Validation & Discovery

*This is the scientific payoff of the pipeline, not a bibliography page. Steps 1–7 establish what can be trusted in the dataset; Step 8 converts those results into a rigorous scientific interpretation, tests that interpretation against prior knowledge, identifies what appears replicated versus unexpected, and proposes the highest-value next experiments. The page should read like a strong Results + Discussion handoff for a scientist, while keeping observation, literature-supported interpretation, and hypothesis clearly separated.*

```yaml
step_id: scientific_synthesis
page_key: synthesis
gate_ids: [SYNTHESIS]
inputs:
  [study_design, decision_log, all_gate_notes, qc_results, alpha_results,
   beta_results, differential_abundance_results, artifact_warnings,
   all_citations_used, study_context]
outputs:
  [scientific_summary, evidence_map, literature_validation,
   discovery_hypotheses, proposed_experiments, limitations,
   key_references, decision_timeline, reproducibility_checklist,
   downloadable_artifacts]
```

| Stage | Scientific task | Default agent behavior | Diagnostics / evidence to integrate | Required output | Key pitfall |
|---|---|---|---|---|---|
| 8A | Reconstruct the scientific question | Restate the comparison in biological terms: what biological system was sampled, what groups/exposures/timepoints are being compared, and what the data can actually establish given the study design | Study-design metadata, grouping decision, pairing/repeated-measures structure, sample exclusions, batch/confounding notes | 2–4 sentence **Study question & evidence scope** | Starting with statistical outputs instead of the biological question; implying causality from a cross-sectional association |
| 8B | Synthesize the run into a coherent finding | Integrate QC, alpha diversity, beta diversity, and DA rather than summarizing each page independently | Retained N by group; sequencing-depth/QC balance; alpha effect direction + uncertainty; PERMANOVA R² + p + dispersion; robust DA taxa + effect direction/magnitude + prevalence + method agreement | **What we found**: 3–6 ranked findings, each stated as a biological claim with quantitative support | Producing a laundry list of p-values; treating alpha, beta, and DA as independent stories when they describe different scales of the same community |
| 8C | Grade internal evidence | Classify each claim as **robust**, **suggestive**, **fragile**, or **null/inconclusive** based on convergence across analyses and known artifacts | Multiple-testing correction, effect size, prevalence, DA method agreement, batch sensitivity, dispersion, exclusion imbalance, paired/clustered inference, expectation checks | Evidence badge + one-sentence rationale for every headline claim | Equating statistical significance with biological importance, or consensus across related methods with independent validation |
| 8D | Validate against literature | Use Paperpile actively to determine whether each major finding is replicated, directionally consistent, context-dependent, contradictory, or apparently under-described | Disease/exposure + body site + assay + taxonomic rank + each headline taxon/community result; prioritize systematic reviews/meta-analyses and large independent cohorts, then mechanistic studies | **Literature validation matrix** with this-study result, prior evidence, concordance, relevant context differences, and citations | Cherry-picking papers that agree; comparing a genus-level 16S association with a species/strain-level shotgun result as though they were identical |
| 8E | Generate biological hypotheses | For robust or interesting discordant findings, infer plausible mechanisms only when supported by literature; label them explicitly as hypotheses | Taxon biology, metabolites/pathways, host interactions, ecological relationships, disease mechanisms, medication/diet context, literature strength | 1–3 **testable mechanistic hypotheses**, each with observation → literature bridge → proposed mechanism → prediction | Turning association into mechanism; inventing taxon functions from memory; presenting a plausible story as established biology |
| 8F | Propose discovery experiments | Rank experiments by how directly they discriminate among hypotheses and how feasible they are | Current assay resolution, available samples/metadata, candidate taxa, predicted pathways/metabolites, confounders, replication needs | 2–5 prioritized **next experiments**, each with question, experiment, expected discriminating result, and what it would change | Suggesting generic “do metagenomics/metabolomics” follow-ups without specifying what hypothesis they test |
| 8G | Identify biomarker / translational leads | Only promote signals with adequate internal robustness; distinguish discovery from validation | Effect size, prevalence, consistency, taxonomic resolution, cross-method support, literature replication, potential confounding | **Candidate leads** labeled discovery-only / replication-ready / mechanistic-priority; omit section if evidence is weak | Calling a differentially abundant taxon a biomarker without out-of-sample discrimination, independent replication, or attention to confounding |
| 8H | State limitations and alternative explanations | Generate the strongest credible alternative explanation for each major conclusion | Study design, batch, sequencing depth, taxonomic resolution, compositionality, medications/diet/age/sex if available, contamination where relevant, multiple testing | Short **What could still explain this?** section and explicit uncertainty language | Boilerplate limitations detached from the actual claims |
| 8I | Preserve auditability | Keep the prior reproducibility/reference function, but subordinate it to scientific synthesis | Decision log, parameters, software/method choices, verified citations | Key references + compact decision/reproducibility appendix + `RUN.JSON` | Allowing the attractive narrative to hide methodological choices or user overrides |

### 8.1 Scientific synthesis: answer the biological question first

The first screen should answer, in plain scientific language, **“What did this experiment teach us?”** before showing a reference list.

The agent should construct the synthesis in this order:

1. **Study question and evidence scope.** State the biological comparison and the unit of inference. Include whether the design is cross-sectional, paired, longitudinal, randomized, etc. Explicitly distinguish association from causal evidence.
2. **Data credibility.** Give one compact sentence on whether QC, depth, batch balance, exclusions, and sample independence leave the comparison interpretable. Do not repeat the whole QC page; surface only issues that materially change interpretation.
3. **Community-level result.** Integrate alpha and beta diversity. Example structure: “Cases did not show a global loss of within-sample diversity, but community composition differed modestly between groups (PERMANOVA R²=…, q/p=…), with no evidence that the result was explained solely by unequal dispersion.” This is more useful than separately saying “Shannon NS” and “PERMANOVA significant.”
4. **Taxon-level result.** State which taxa most robustly distinguish the groups, their direction, effect magnitude, prevalence, and DA-method agreement. Distinguish broad community remodeling from a small number of taxon-specific shifts.
5. **Overall interpretation.** Give the minimum biological statement supported by all of the above. If the evidence is weak or contradictory, say so clearly; a rigorous null or ambiguous result is a scientific result.

Every headline claim must be traceable to a quantitative result. Prefer effect sizes, uncertainty, prevalence, and variance explained over binary significant/non-significant language.

### 8.2 Evidence map: separate observation from interpretation

For each major finding, create an evidence card/table with four layers:

| Layer | Question | Example |
|---|---|---|
| **Observed** | What did this dataset directly show? | “Genus X was more abundant in cases and significant in 3/3 DA methods.” |
| **Internally supported** | What makes that result trustworthy or fragile here? | “Present in 72% of samples; direction stable across methods; not concentrated in one batch.” |
| **Literature-supported interpretation** | What does prior work allow us to infer? | “Independent CRC cohorts also report enrichment; mechanistic studies link species X to pathway Y.” |
| **Hypothesis / next test** | What new explanation follows, but remains unproven? | “X may contribute through Y; measure metabolite Y and test whether it mediates the case association.” |

Never collapse these four layers into one prose claim. This is the primary guardrail against an AI scientist generating a compelling but unsupported biological story.

### 8.3 Paperpile literature-validation workflow

Paperpile is a scientific reasoning tool in this step, not merely a citation manager. Use it heavily but selectively.

**Resource-efficient search strategy:**

1. **Start broad once.** Search the exact biological comparison plus `microbiome` and prioritize one recent systematic review/meta-analysis or large multi-cohort study. Use it to establish the field-level prior and vocabulary.
2. **Then search only findings that survived the pipeline.** Do not run literature searches for hundreds of taxa. Search the headline consensus taxa, important null/discordant findings, and any result driving a mechanistic hypothesis.
3. **Use layered queries.** For each priority finding search, in order: `(condition/exposure + taxon)`, then `(condition/exposure + taxon + mechanism/metabolite/pathway)`, and only then narrower species/strain terms if the assay resolution supports them.
4. **Prefer evidence hierarchy over search volume.** First: systematic reviews/meta-analyses and large independent cohorts. Second: independent human replication. Third: mechanistic human/animal/in-vitro studies. Use reviews to discover canonical primary papers, but cite the primary mechanistic evidence when making a mechanism claim.
5. **Search for contradiction deliberately.** For each headline result, run at least one query intended to find null or opposite-direction evidence. Do not let Paperpile become a confirmation engine.
6. **Match context before declaring replication.** Compare body site, disease stage/phenotype, geography, age, medications/antibiotics, sequencing modality, taxonomic rank, and case definition where available. Label partial matches as context-dependent rather than “confirmed.”
7. **Verify the exact support.** Before a paper is attached to a claim, resolve the paper in Paperpile and verify the relevant result or passage. Store the DOI/PMID and the exact claim supported in the run evidence record. Never cite from title/abstract resemblance alone when the full text is available.
8. **Stop when marginal value falls.** A practical target is ~1 strong synthesis source plus 1–3 high-value independent or mechanistic sources per headline finding. Search deeper only when evidence conflicts, the finding is novel, or it will motivate an experiment.

The agent should return one of these literature statuses for each major result: **replicated**, **directionally consistent**, **context-dependent/mixed**, **contradicted**, **apparently novel/under-described**, or **insufficient literature**. “Novel” must never mean “the first report”; it means only that the targeted search did not find a close precedent.

### 8.4 From literature validation to scientific discovery

The product should become most useful when it moves from “does this match prior papers?” to “what new experiment is now worth doing?”

For each finding worth pursuing, the agent should reason through:

`dataset observation → robustness → prior evidence → knowledge gap → mechanistic hypothesis → discriminating experiment`

A proposed hypothesis should contain:

- **Observation:** the exact result in this dataset that motivates it.
- **Literature bridge:** the independently supported biological fact connecting the taxon/community pattern to a plausible pathway or host phenotype.
- **Hypothesis:** one falsifiable statement, explicitly labeled as a hypothesis.
- **Prediction:** what should be observed if the hypothesis is correct.
- **Alternative:** at least one plausible competing explanation.
- **Experiment:** the smallest high-information experiment that distinguishes the hypothesis from the alternative.

Prefer experiments that upgrade the type of evidence rather than merely repeat the same analysis. Depending on the study, examples include:

- **Independent cohort / held-out validation** when the main uncertainty is reproducibility or biomarker transportability.
- **Species/strain-resolved shotgun metagenomics or targeted qPCR** when a genus-level 16S signal may hide opposing species or when taxonomic identity is central to the hypothesis.
- **Targeted or untargeted metabolomics** when the hypothesis specifically predicts a microbial metabolite or pathway output; name the metabolite/pathway to measure when literature supports one.
- **Longitudinal sampling** when directionality or temporal ordering is the key uncertainty.
- **Ex-vivo culture/co-culture, organoid, cell, or animal perturbation** when the question has advanced from association to whether a candidate organism or product can alter a host phenotype. The agent should specify the perturbation, comparator, and readout rather than merely saying “validate experimentally.”
- **Metadata-stratified or adjusted re-analysis** when medication, diet, age, site, batch, or another host variable is a credible alternative explanation and can be tested before spending wet-lab resources.

Rank proposed experiments by **information gain × feasibility × relevance to the central biological question**. The first recommendation should usually be the experiment most likely to change the scientist's belief about the mechanism, not the most technologically elaborate experiment.

### 8.5 Biomarker and translational interpretation

Differential abundance is **feature discovery**, not biomarker validation. If the user’s scientific context is diagnostic, prognostic, pharmacologic, or translational, the agent may identify promising leads but must state the evidence stage.

A candidate can be called:

- **Discovery-only** — associated in this dataset but not independently validated.
- **Replication-ready** — internally robust and supported by external literature; worth testing in an independent cohort with a pre-specified model/threshold.
- **Mechanistic-priority** — association plus credible mechanistic literature makes it especially valuable for experimental follow-up.

Do not claim clinical biomarker utility from a volcano plot. Clinical/diagnostic utility requires a separate prediction/validation analysis with out-of-sample discrimination, calibration where relevant, incremental value over existing predictors, and external validation appropriate to the intended use.

### 8.6 Contradictions and null findings are first-class results

The synthesis must actively surface:

- expected literature findings that were **not** reproduced;
- robust findings in the **opposite direction** from prior work;
- alpha/beta/DA patterns that do not tell a simple single story;
- results that disappear under a sensitivity analysis or are plausibly batch-driven;
- strong literature expectations the present assay cannot test because of taxonomic or functional resolution.

For each contradiction, propose the most plausible explanations in ranked order: biological heterogeneity, cohort/context difference, assay/taxonomic-resolution difference, power/prevalence, confounding/batch, or false positive. Do not automatically explain discordance away.

### 8.7 User-facing page structure

The final page should prioritize scientific insight in this order:

1. **Hero finding — one sentence.** The strongest defensible answer to the study question.
2. **What we learned — 3–6 evidence-backed findings.** Quantitative, ranked, concise.
3. **How this fits the field.** Literature-validation matrix showing replicated, mixed, contradictory, and potentially novel findings.
4. **Discovery opportunities.** 1–3 mechanistic hypotheses and 2–5 ranked experiments.
5. **What could still explain this?** Claim-specific limitations and alternative explanations.
6. **Key references.** Only the papers that materially support interpretation or methodology, grouped by claim rather than chronology.
7. **Audit & reproduce.** Collapsible decision timeline, parameters, user overrides, software/method versions, and downloadable `RUN.JSON`/results tables.

The UI should visually distinguish **DATA**, **LITERATURE**, and **HYPOTHESIS** statements. A scientist should never have to infer which kind of claim they are reading.

### 8.8 Key references and reproducibility

Reference compilation remains mandatory but is no longer the purpose of the page.

- Group scientific references by the finding or hypothesis they support.
- For every substantive literature claim, re-resolve the citation through Paperpile and record the exact support used.
- Keep methodological references separately under **Methods used in this run**.
- Every gate retains its append-only decision-log entry: timestamp, gate ID, agent proposal, confidence, user choice/override, and reason.
- Export every chosen or computed parameter required to recreate the analysis, including sample exclusions, normalization/rarefaction settings, significance/FDR settings, distance metric, prevalence filter, DA methods and versions, permutation count/seed where applicable, and taxonomic rank.
- `RUN.JSON` must be sufficient to reconstruct the analysis without guessing interactive choices.

### 8.9 Final agent self-review before presenting the synthesis

Before showing Step 8, run a short internal reviewer pass:

1. **Claim audit:** Does every headline statement have direct support from this run?
2. **Magnitude audit:** Did we report effect size / R² / prevalence / uncertainty where relevant rather than only p-values?
3. **Confounding audit:** Could batch, exclusions, repeated sampling, depth, medication/host metadata, or dispersion materially change any claim?
4. **Literature audit:** Did we search both supporting and conflicting evidence, and are assay/taxonomic contexts comparable?
5. **Causality audit:** Did any association accidentally become causal language?
6. **Novelty audit:** Is anything called novel without a targeted literature search? If so, downgrade the wording.
7. **Experiment audit:** Does each proposed experiment test a named hypothesis and specify what outcome would support or weaken it?
8. **Resolution audit:** Are genus-level 16S results being interpreted only at the resolution the assay supports?
9. **Reproducibility audit:** Can a collaborator reproduce every reported analysis from the exported run state?

**Agent guidance.** Step 8 should behave like a rigorous scientist at the whiteboard after the analysis is finished: first decide what the data actually say, then interrogate that conclusion against the literature, then ask what observation would most efficiently move the science forward. It must be ambitious in hypothesis generation but conservative in claim language. The product succeeds when a wet-lab scientist can leave this page knowing **(a)** what changed in the microbiome, **(b)** how confident to be, **(c)** how it relates to existing biology, **(d)** what is genuinely surprising, and **(e)** what experiment is most worth doing next — while a reviewer can still audit every analytical choice that produced those conclusions.

---
