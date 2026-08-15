# Gut Pilot --- Step 5: Alpha Diversity

``` yaml
step_id: alpha_diversity
page_key: alpha
gate_ids: [G8]
inputs:
  [diversity_analysis_table, group_assignment, batch_handling,
   dependence_structure, covariates, rarefaction_metadata,
   coverage_based_sensitivity_optional]
outputs:
  [alpha_metric_table, alpha_distribution_plots, effect_size_table,
   inference_results, expectation_check, sensitivity_results,
   gate_note, agent_interpretation_card]
```

## Scientific purpose

Alpha diversity asks a simple biological question:

> **How diverse is the microbial community within each individual
> sample, and does within-sample diversity differ between the biological
> groups being compared?**

It does **not** identify which taxa differ between groups. That is Step
7. It also does not measure how different two samples are from one
another; that is beta diversity in Step 6.

A useful alpha-diversity analysis separates three related concepts:

1.  **Richness:** how many different taxa are represented?
2.  **Common-taxon diversity:** how many taxa are effectively
    represented after accounting for their relative abundances?
3.  **Dominance/evenness:** is the community distributed across many
    taxa or dominated by a few?

For a wet-lab scientist, the output should answer:

-   Is one group internally more or less diverse?
-   Is the difference driven by richness, by abundance
    balance/dominance, or neither?
-   How large is the difference, not merely whether `p < 0.05`?
-   Is the conclusion robust to study design, confounders, and the
    Step-4 sampling-depth decision?
-   Does the result agree with or contradict the disease-specific prior
    literature?

A null alpha-diversity result is scientifically meaningful. Two groups
can have similar total within-sample diversity while differing strongly
in **which organisms** are present.

## Interpret alpha diversity through the study's unit of comparison

Alpha diversity is a **sample-level ecological phenotype**. Its biological meaning comes from what generated the comparison. Before testing any metric, the agent must translate the Study Design decision into a scientific question and carry that question into every plot, model, and interpretation.

| Unit of comparison | Scientific question | Interesting interpretation | Cannot establish alone |
|---|---|---|---|
| Case vs control | Does disease status associate with altered within-sample ecology? | Disease-associated loss/gain of richness or altered dominance | Causation, mechanism, or which taxa drive it |
| Treatment vs control | Does an intervention alter within-sample ecology? | Treatment-associated ecological perturbation or preservation | Microbiome mediation of clinical benefit |
| Pre vs post within subject | Does ecology change after an intervention/event? | Within-person recovery, disruption, or resilience | Causation unless the design supports it |
| Responder vs non-responder | Is ecological state associated with response? | Diversity as a treatment-response ecological phenotype | Predictive utility unless measured before outcome and validated |
| Baseline diversity vs future outcome | Does pretreatment ecology predict relapse, response, progression, or toxicity? | Candidate prognostic/predictive biomarker | Clinical utility without validation/incremental-value testing |
| Longitudinal trajectory | How does ecology evolve through disease/treatment/recovery? | Recovery, persistent perturbation, resilience, state transitions | A simple cross-sectional high/low-diversity story |

Longitudinal microbiome studies can reveal within-subject dynamics, disease progression, and treatment effects, but repeated observations must be modeled as correlated measurements. Translational microbiome guidance similarly emphasizes matching sampling design to scientific purpose.

### Agent requirement — formulate the scientific estimand first

```yaml
scientific_question:
  unit_of_comparison: <case_vs_control | treatment_vs_control | pre_vs_post | responder_vs_nonresponder | longitudinal | continuous_clinical_trait | other>
  microbiome_role: <outcome | predictor | treatment_response_marker | longitudinal_state>
  contrast: <plain-language contrast>
  temporal_ordering: <cross_sectional | microbiome_before_outcome | intervention_before_microbiome | repeated_over_time>
  scientific_question: <one sentence>
  strongest_permitted_interpretation: <association | within-person_change | treatment-associated_change | prognostic_association | other>
```

Examples:
- **CRC case/control:** “Do CRC cases differ from controls in within-sample microbial richness or abundance balance?”
- **Drug pre/post:** “Does within-person microbial diversity change after treatment initiation?”
- **Treatment response:** “Do responders and non-responders differ in baseline diversity, and/or do their diversity trajectories diverge after treatment?”
- **Prospective outcome:** “Is baseline microbial diversity associated with subsequent clinical relapse?”

Do not collapse these into the generic statement “group A has lower diversity than group B.”

### Escalate toward biologically higher-value questions when supported

After the prespecified primary comparison, inspect metadata for **scientifically motivated** variables that permit a richer analysis: treatment, timepoint, response, disease severity, relapse/progression, inflammatory markers, toxicity, metabolite measurements, or other prespecified clinical phenotypes. Do not mine arbitrary metadata columns for significance. Propose secondary hypotheses for human approval.

```text
case/control difference                 -> descriptive disease-associated ecology
pre/post treatment change              -> ecological perturbation or recovery
baseline diversity -> later response   -> candidate predictive/prognostic biomarker
diversity trajectory tracks outcome   -> candidate response-state marker
treatment -> diversity -> outcome      -> candidate mediation hypothesis requiring dedicated analysis
```

Alpha diversity alone cannot establish mediation or mechanism.

### Turn each alpha result into a biological next question

- **Richness decreases:** Which taxa are lost, and are losses biologically coherent?
- **Shannon/Simpson decrease with stable richness:** Which taxa became dominant?
- **Diversity increases after treatment:** Is this restoration toward a reference state, expansion of beneficial taxa, or simply more taxa?
- **Baseline diversity predicts outcome:** Does it add information beyond clinical covariates, and which taxa/functions underlie the predictive state?
- **Alpha diversity is unchanged:** Do not conclude “no microbiome effect”; composition can change while total diversity remains constant, so proceed to beta diversity and taxon-level analysis.

This converts alpha diversity from a boxplot endpoint into a community-level phenotype interpreted in the context of how the data were collected and why the groups or timepoints are being compared.

------------------------------------------------------------------------

## G8 --- Inference and reporting plan

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  Gate     Decision           Options → when to pick     Default                    Diagnostics to compute    Method / test            Key pitfall          Evidence
                                                                                    first                                                                   
  -------- ------------------ -------------------------- -------------------------- ------------------------- ------------------------ -------------------- ---------------
  G8       Alpha-diversity    Observed richness;         **Primary descriptive set: Verify feature table/rank Per-sample alpha metrics Reporting many       Chao1984;
           metric family      Shannon; Simpson; optional Observed richness +        and rarefaction state;                             highly correlated    Pielou1966;
                              Chao1; optional Pielou;    Shannon + Simpson.**       inspect distributions;                             indices as if they   Chao2014;
                              optional Faith PD if a     Report Chao1/Pielou as     check whether a                                    were independent     QIIME2
                              valid tree exists          secondary when useful;     phylogenetic tree exists;                          biological           
                                                         Faith PD only with a       check Step-4 coverage                              discoveries; or      
                                                         phylogenetic tree. Prefer  diagnostics                                        treating Chao1 as    
                                                         Hill-number equivalents in                                                    observed richness    
                                                         advanced/coverage-based                                                                            
                                                         sensitivity analyses                                                                               

  G8       Statistical        Simple unadjusted          **Follow G2/G3 study       Distribution/outliers;    Wilcoxon/Mann--Whitney   Defaulting to        Current
           comparison         two-group comparison vs    design.** Simple Wilcoxon  group sizes;              for simple independent   Wilcoxon after Step  microbiome
                              covariate-adjusted         only when samples are      covariates/confounders;   comparison; signed-rank  2 identified         statistical
                              regression vs              independent and no         subject                   for simple complete      confounders or       guidance;
                              paired/repeated-measures   adjustment is required.    clustering/pairing; batch pairs; regression or     repeated measures    study-design
                              model                      Otherwise use an           structure                 mixed-effects model when discards the study   principles
                                                         appropriate                                          adjustment/dependence is design and can       
                                                         regression/mixed-effects                             required                 produce misleading   
                                                         model                                                                         p-values             

  G8       Significance       0.01 / 0.05 / 0.10         0.05 unless the protocol   None; policy choice       Two-sided inference      Choosing alpha after ---
           threshold          exploratory                pre-specified otherwise                              unless a directional     seeing the result    
                                                                                                              hypothesis was                                
                                                                                                              prospectively specified                       

  G8       Multiple-testing   BH-FDR / Holm or           **BH across the            Count the alpha-diversity Benjamini--Hochberg by   Correcting across    BH1995
           correction         Bonferroni / none          inferential                hypotheses actually       default                  unrelated future     
                                                         alpha-diversity metric     treated as inferential;                            hypothesis families, 
                                                         family for this scientific distinguish primary vs                             or reporting five    
                                                         comparison.** Keep raw     secondary/exploratory                              correlated metrics   
                                                         p-values visible. Do       metrics                                            as five independent  
                                                         **not** pool                                                                  confirmations        
                                                         alpha-diversity tests with                                                                         
                                                         the hundreds of Step-7 DA                                                                          
                                                         tests into one BH                                                                                  
                                                         correction merely because                                                                          
                                                         they share a run                                                                                   

  ---      Effect-size        Difference in              Always report a            Group summaries and       Bootstrap CI for simple  "Significant" says   Chao2014
           reporting          medians/means;             **direction +              bootstrap/model           descriptive contrasts;   nothing about        
                              standardized effect; model interpretable effect       uncertainty               model-based CI for       biological           
                              coefficient; ratio of Hill estimate + uncertainty                               regression/mixed models  magnitude; p-values  
                              numbers where applicable   interval** alongside p/q                                                      alone encourage      
                                                                                                                                       overinterpretation   

  ---      Step-4 sensitivity Primary rarefied analysis  Re-run or compare at a     G7 reviewer challenge;    Sensitivity analysis     An alpha-diversity   Willis2019;
                              only vs depth sensitivity  defensible nearby          excluded samples; group                            conclusion that      ChaoJost2012;
                              vs coverage-based          rarefaction depth when the balance; coverage                                  flips under a small  Chao2014
                              sensitivity                G7 choice was borderline;  diagnostics                                        reasonable change in 
                                                         use coverage-based                                                            rarefaction depth is 
                                                         Hill-number analysis when                                                     fragile and must not 
                                                         Step 4 flagged                                                                be presented as      
                                                         completeness concerns or                                                      robust               
                                                         richness is central                                                                                
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# Metric interpretation

## 1. Observed richness

Observed richness is simply the number of taxa detected in a sample
after the Step-4 standardization.

If one sample contains 120 observed genera and another contains 80, the
first has greater observed richness.

**Strength:** extremely interpretable.

**Limitation:** it is highly sensitive to sampling effort and rare taxa.
It counts a taxon observed once the same as a dominant taxon.

Interpret as:

> "How many different taxa did we observe under the standardized
> sampling procedure?"

Do **not** interpret it as the true number of taxa in the underlying
ecosystem.

------------------------------------------------------------------------

## 2. Shannon diversity

Shannon entropy is

\[ H = -`\sum`{=tex}\_i p_i `\log`{=tex}(p_i) \]

where (p_i) is the relative abundance of taxon (i).

It increases when there are more taxa and/or abundances are distributed
more evenly.

For intuitive reporting, optionally convert it to the Hill number:

\[ {}\^1D = e\^H \]

which can be interpreted as the **effective number of equally common
taxa**.

Example:

> "The control community has a Shannon effective diversity of 24 versus
> 18 in cases."

This is often easier for a wet-lab scientist to interpret than an
entropy difference of 0.29.

------------------------------------------------------------------------

## 3. Simpson diversity

Simpson-type diversity gives greater weight to common/dominant taxa and
is less sensitive than richness to very rare organisms.

For interpretable Hill-number reporting use:

\[ {}\^2D = `\frac{1}{\sum_i p_i^2}`{=tex} \]

This is the effective number of equally abundant **common** taxa.

Shannon and Simpson therefore answer related but not identical
questions:

``` text
Observed richness / q=0 → sensitive to rare taxa
Shannon / q=1           → weights taxa by abundance
Simpson / q=2           → emphasizes common/dominant taxa
```

The Hill-number framework makes these three measures a coherent
diversity profile rather than an arbitrary collection of indices.

------------------------------------------------------------------------

## 4. Chao1 --- secondary richness estimator

Chao1 attempts to estimate unseen richness using the number of rare
taxa, particularly singletons and doubletons.

It can be useful, but it should **not automatically be treated as a
co-primary metric**.

Why:

-   it estimates richness rather than directly measuring observed
    richness;
-   it is sensitive to rare-count structure;
-   Step 4 may already have performed rarefaction and/or coverage-based
    richness analysis;
-   modern coverage-based rarefaction/extrapolation provides a more
    explicit framework for handling incomplete sampling.

If Chao1 and observed richness disagree materially, flag the
disagreement rather than averaging them into one conclusion.

------------------------------------------------------------------------

## 5. Pielou evenness --- secondary decomposition metric

Pielou's evenness is commonly defined as:

\[ J = `\frac{H}{\log(S)}`{=tex} \]

where (H) is Shannon entropy and (S) is richness.

It asks how evenly abundance is distributed among the observed taxa.

It is useful when the scientist specifically wants to distinguish:

> "There are fewer taxa"

from

> "The same number of taxa exists, but a few taxa dominate."

Because Pielou is mathematically derived from Shannon and richness, it
should not be presented as an independent confirmation of those metrics.

------------------------------------------------------------------------

## Optional Faith phylogenetic diversity

If---and only if---a valid phylogenetic tree is available, Faith PD can
be added to quantify the total phylogenetic branch length represented
within each sample.

If no tree exists, state:

> "Phylogenetic alpha diversity was not evaluated because no validated
> phylogenetic tree was supplied."

Do not silently omit it or infer a tree from genus names.

------------------------------------------------------------------------

# Analysis algorithm

## 1. Confirm the Step-4 analysis population

Before calculating group comparisons:

-   confirm the rarefaction/standardization strategy;
-   list samples retained for alpha diversity;
-   list samples excluded from this analysis;
-   confirm post-exclusion group counts;
-   confirm batch overlap;
-   preserve G3 subject clustering/pairing.

If Step 4 required a coverage-based sensitivity analysis, carry that
requirement forward.

------------------------------------------------------------------------

## 2. Compute per-sample diversity

For every retained sample compute:

**Primary descriptive metrics** - observed richness; - Shannon; -
Simpson.

**Secondary metrics when scientifically useful** - Chao1; - Pielou
evenness; - Faith PD if a valid tree exists.

Where possible, also express Shannon and Simpson as Hill numbers (`q=1`,
`q=2`) for intuitive effect-size interpretation.

If Step 4 uses repeated rarefaction, do not arbitrarily use one random
rarefied table. Aggregate diversity estimates across the specified
repeated resamples and retain the resampling variability.

------------------------------------------------------------------------

## 3. Plot the raw sample-level distributions before testing

For every primary metric show individual samples.

Preferred visualization:

``` text
jittered sample points
+ group median or mean
+ uncertainty interval
```

Use paired lines when G3 identified paired/repeated samples.

Avoid bar charts containing only group means.

A composition stacked-bar chart may be shown as **optional descriptive
context**, but it is not an alpha-diversity result and should not be
required before alpha-diversity inference. Taxonomic composition is
addressed more directly in Step 7.

------------------------------------------------------------------------

## 4. Select the statistical model from the study design

### Simple independent two-group design

If:

-   samples are independent;
-   there are exactly two groups;
-   G2 found no covariate requiring adjustment;
-   no subject clustering exists;

use a two-sided Wilcoxon/Mann--Whitney comparison as the robust default.

Report group medians/IQRs, an interpretable group contrast, uncertainty,
raw p, and corrected q.

### Simple paired design

If samples form complete pairs and no additional covariate structure
must be modeled, use a paired analysis such as Wilcoxon signed-rank and
display within-pair changes.

### Covariate-adjusted design

If Step 2 identified relevant confounding variables such as age, sex,
batch, site, medication, or another prespecified covariate, **do not
revert to unadjusted Wilcoxon**.

Treat the alpha-diversity metric as a scalar outcome and fit an
appropriate regression model:

``` text
alpha_diversity ~ biological_group + prespecified_covariates
```

Inspect residual/model assumptions. If ordinary linear-model assumptions
are poor, use an appropriate robust/generalized approach rather than
ignoring the covariates.

### Repeated measures / multiple samples per subject

If G3 identified repeated observations, use a mixed-effects or otherwise
cluster-aware model, for example:

``` text
alpha_diversity ~ biological_group + covariates + (1 | subject_id)
```

when scientifically appropriate.

The exact model must inherit the dependence structure from G3 rather
than rediscovering it here.

------------------------------------------------------------------------

## 5. Report effect size before significance

For every inferential metric, the narrative order is:

1.  direction;
2.  magnitude;
3.  uncertainty;
4.  p/q value.

Example:

> "Cases showed lower Shannon diversity than controls (median 3.6 vs
> 4.0; estimated median difference −0.4, 95% bootstrap CI −0.7 to −0.1;
> BH-adjusted q=0.03)."

Not:

> "Shannon diversity was significantly different (p=0.02)."

If Hill numbers are available, prefer an intuitive statement such as:

> "The Shannon effective diversity was approximately 18% lower in
> cases."

Do not use causal language unless the study design supports causal
inference.

------------------------------------------------------------------------

## 6. Multiple-testing correction

The agent must distinguish **hypothesis families**.

For the alpha-diversity page:

-   define which metrics are inferential;
-   apply BH across those alpha-diversity hypotheses by default;
-   retain raw p-values;
-   label secondary metrics as secondary/exploratory when appropriate.

Do **not** apply one BH procedure jointly across:

``` text
5 alpha metrics
+ beta-diversity tests
+ hundreds of DA taxa
```

merely because they occur in the same Gut Pilot run.

Those are distinct scientific hypothesis families.

If the study protocol defines one primary alpha-diversity endpoint,
clearly mark it as primary and the others as secondary; do not
retroactively choose the metric with the smallest p-value.

------------------------------------------------------------------------

# Pattern-based biological interpretation

The agent should synthesize metrics rather than narrating five p-values
independently.

### Pattern A --- richness lower, Shannon/Simpson similar

Interpretation:

> The group appears to contain fewer detected rare taxa, while the
> abundance structure among common taxa is broadly preserved.

### Pattern B --- richness similar, Shannon/Simpson lower

Interpretation:

> The number of detected taxa is similar, but the community is more
> dominated by a subset of taxa / less evenly distributed.

Check Pielou evenness to help distinguish this pattern.

### Pattern C --- richness, Shannon, and Simpson all lower

Interpretation:

> Evidence is consistent with a broad reduction in within-sample
> taxonomic diversity affecting both richness and abundance balance.

Do not call this "dysbiosis" without defining what that term means.

### Pattern D --- no alpha-diversity difference

Interpretation:

> The groups have similar overall within-sample diversity by these
> metrics. This does **not** imply similar microbiome composition; the
> same diversity can be produced by different taxa. Proceed to beta
> diversity and differential abundance.

### Pattern E --- metrics disagree or sensitivity analysis changes conclusion

Interpretation:

> The alpha-diversity result depends on which part of the abundance
> distribution or sampling standardization is emphasized. Treat the
> conclusion as metric-sensitive rather than forcing a single "diversity
> increased/decreased" statement.

------------------------------------------------------------------------

# Disease-specific expectation check

Do not encode a universal prior that disease means "lower diversity."

Before interpretation, retrieve disease-specific literature.

For CRC specifically, the literature is not compatible with a simplistic
"CRC must have lower diversity" prior. Thomas et al. (2019), for
example, reported reproducibly **higher species richness** in CRC across
multiple metagenomic cohorts, partly reflecting expansion of
oral-associated species. Other CRC studies have reported lower or
non-significantly different alpha-diversity measures.

Therefore the agent should write:

``` yaml
expectation_check:
  disease_area: colorectal_cancer
  prior_direction:
    richness: <higher|lower|mixed|unknown>
    shannon: <higher|lower|mixed|unknown>
  evidence_strength: <description>
  observed_direction: <description>
  concordance: SUPPORTS_PRIOR | CONTRADICTS_PRIOR | LITERATURE_MIXED | NOT_TESTABLE
```

When the literature is heterogeneous, say **literature mixed** rather
than manufacturing a single expected direction.

The expectation check is contextualization, not a validity test. A
result does not become more credible merely because it reproduces prior
literature.

------------------------------------------------------------------------

# Robustness / sensitivity check

The alpha-diversity conclusion should inherit uncertainty from Step 4.

Trigger a sensitivity analysis when:

-   G7 confidence was moderate/low;
-   the selected depth excluded meaningful numbers of samples;
-   exclusions were asymmetric by group/batch;
-   the reviewer challenge identified a nearby plausible depth;
-   richness is a central scientific endpoint;
-   coverage differed materially between groups.

Possible sensitivity analyses:

1.  repeat the alpha analysis at the most scientifically plausible
    alternative rarefaction depth;
2.  perform coverage-based Hill-number analysis;
3.  compare conclusions with/without a flagged borderline sample when
    scientifically justified.

Report:

> "The direction and inference were unchanged under the prespecified
> alternative depth."

or:

> "The Shannon difference is no longer supported at the nearby
> alternative depth; treat this finding as depth-sensitive."

Do not search multiple depths and report the one producing the smallest
p-value.

------------------------------------------------------------------------

# Wet-lab-facing result card

The final alpha-diversity card should not be a table of five unexplained
indices.

Example:

> **Within-sample diversity: no evidence of a broad diversity loss**
>
> **What we checked:** We compared how many genera each sample contained
> (richness), how broadly abundance was distributed (Shannon), and
> whether common genera were dominated by a small subset (Simpson).
> Samples were compared using the Step-4 standardized depth, with the
> study-design adjustments from Step 2.
>
> **Result:** Cases had slightly higher observed richness, while Shannon
> and Simpson diversity were similar between groups. None of the
> prespecified alpha-diversity comparisons passed the FDR threshold.
>
> **Interpretation:** The disease group does not show a broad loss of
> within-sample diversity. This does not mean the microbiomes are the
> same: disease-associated taxa could replace healthy-associated taxa
> without changing total diversity.
>
> **Robustness:** The conclusion was unchanged at the prespecified
> alternative rarefaction depth.
>
> **Next:** Beta diversity tests whether the overall community
> composition differs between groups; differential abundance identifies
> which taxa drive those differences.

This is the level at which a wet-lab collaborator can immediately
understand the biological result.

------------------------------------------------------------------------

# Agent instructions

1.  Explain alpha diversity as **within-sample diversity** before
    presenting statistics.
2.  Do not equate alpha diversity with taxonomic composition.
3.  Use observed richness, Shannon, and Simpson as the primary
    descriptive diversity profile.
4.  Treat Chao1 and Pielou as secondary/decomposition metrics unless the
    protocol specifies otherwise.
5.  Add Faith PD only when a validated phylogenetic tree is available.
6.  Prefer Hill-number equivalents for Shannon/Simpson when they improve
    interpretability.
7.  Inherit the Step-4 standardization and Step-2 study design exactly.
8.  If repeated rarefaction was used, aggregate across resamples rather
    than selecting one arbitrary rarefaction.
9.  Plot individual sample values before inferential summaries.
10. Use Wilcoxon only for a simple independent unadjusted comparison.
11. Use paired/cluster-aware models when G3 identified dependence.
12. Use covariate-adjusted regression when G2 or the protocol requires
    adjustment.
13. Report direction and effect magnitude before p/q values.
14. Include uncertainty intervals wherever practical.
15. Apply multiple-testing correction to the prespecified
    alpha-diversity hypothesis family, not automatically across
    unrelated beta/DA hypotheses.
16. Never choose a primary metric after seeing which metric is
    significant.
17. Retrieve a disease-specific prior rather than assuming disease
    should reduce diversity.
18. Treat literature concordance as context, not validation.
19. Explicitly state that null alpha diversity does not imply equal
    microbiome composition.
20. Run Step-4 sensitivity analyses when the normalization/depth
    decision was fragile.
21. Do not use causal language for observational group differences.
22. Produce a plain-language wet-lab interpretation answering: **what
    changed, by how much, what biological aspect of diversity changed,
    how robust is it, and what should we examine next?**
23. Before inference, explicitly state the **unit of comparison, temporal ordering, microbiome role, and scientific estimand** inherited from Study Design.
24. Interpret case/control, treatment, pre/post, responder/non-responder, prospective-outcome, and longitudinal contrasts according to what each design can establish.
25. When metadata support a higher-value clinical/pharmacological question, propose it as a **secondary hypothesis for human approval**; never scan arbitrary metadata for significance.
26. Distinguish association, prognostic prediction, treatment-response association, and mediation/mechanism.
27. Translate the observed diversity pattern into a concrete downstream question about taxa, dominance, functions, recovery/resilience, or clinical prediction.

------------------------------------------------------------------------

# Required outputs

``` yaml
alpha_diversity:
  status: PASS | PASS_WITH_FLAGS | HUMAN_REVIEW_REQUIRED

  analysis_population:
    n_total_project: <int>
    n_alpha_analysis: <int>
    by_group: {...}
    samples_excluded_from_alpha: [...]
    rarefaction_depth: <int|null>
    repeated_rarefaction_iterations: <int|null>

  metrics:
    primary:
      - observed_richness
      - shannon
      - simpson
    secondary:
      - chao1
      - pielou_evenness
    phylogenetic:
      faith_pd: <computed|unavailable>

  statistical_model:
    design: independent | paired | repeated
    method: <method>
    formula: <formula|null>
    covariates: [...]
    cluster_variable: <subject_id|null>

  results:
    - metric: <name>
      group_summaries: {...}
      direction: <description>
      effect_estimate: <value>
      effect_scale: <description>
      ci_95: [<lower>, <upper>]
      raw_p: <float>
      adjusted_q: <float>
      inferential_status: SUPPORTS_DIFFERENCE | NO_CLEAR_DIFFERENCE

  multiplicity:
    family: alpha_diversity
    method: BH
    alpha: 0.05
    n_tests: <int>

  scientific_context:
    unit_of_comparison: <value>
    microbiome_role: <value>
    temporal_ordering: <value>
    scientific_question: <text>
    strongest_permitted_interpretation: <text>
    higher_value_secondary_hypotheses: [...]

  pattern_interpretation:
    richness: <higher|lower|similar|uncertain>
    common_taxon_diversity: <higher|lower|similar|uncertain>
    evenness_dominance: <higher|lower|similar|uncertain>
    synthesis: <plain-language text>

  expectation_check:
    disease_area: <value>
    literature_prior: <description>
    observed_vs_prior: <description>
    citation_ids: [...]

  sensitivity:
    required: true | false
    analyses: [...]
    conclusion_stable: true | false | unknown

  wetlab_summary:
    headline: <plain-language headline>
    what_we_checked: <text>
    result: <text>
    interpretation: <text>
    robustness: <text>
    next_step: <text>
```

------------------------------------------------------------------------

# Evidence

-   **Chao & Jost 2012:** Chao A, Jost L. *Coverage-based rarefaction
    and extrapolation: standardizing samples by completeness rather than
    size.* Ecology. 2012;93:2533--2547. doi:10.1890/11-1952.1.
-   **Chao et al. 2014:** Chao A, Gotelli NJ, Hsieh TC, et
    al. *Rarefaction and extrapolation with Hill numbers: a framework
    for sampling and estimation in species diversity studies.*
    Ecological Monographs. 2014;84:45--67. doi:10.1890/13-0133.1.
    Provides the unified q=0/q=1/q=2 Hill-number framework and bootstrap
    uncertainty.
-   **Willis 2019:** Willis AD. *Rarefaction, Alpha Diversity, and
    Statistics.* Front Microbiol. 2019;10:2407.
    doi:10.3389/fmicb.2019.02407. Emphasizes statistical uncertainty and
    unobserved diversity in alpha-diversity inference.
-   **QIIME 2 diversity documentation:** supports standard computation
    of observed features, Shannon entropy, Pielou evenness, Faith PD,
    and related alpha-diversity metrics; phylogenetic diversity requires
    phylogenetic information.
-   **Thomas et al. 2019:** Thomas AM, et al. *Metagenomic analysis of
    colorectal cancer datasets identifies cross-cohort microbial
    diagnostic signatures and a link with choline degradation.* Nat Med.
    2019;25:667--678. doi:10.1038/s41591-019-0405-7. Reported
    reproducibly higher richness in CRC across multiple cohorts,
    illustrating why "disease = lower alpha diversity" is not a safe
    universal prior.
-   **Systematic review of microbiome analysis practice (2021):**
    highlights that different alpha indices measure different diversity
    domains and that studies frequently fail to account for clustered
    observations when testing alpha diversity.
-   **Benjamini & Hochberg 1995:** Benjamini Y, Hochberg Y. *Controlling
    the false discovery rate: a practical and powerful approach to
    multiple testing.* J R Stat Soc B. 1995;57:289--300.
-   **Chao 1984:** Chao A. *Non-parametric estimation of the number of
    classes in a population.* Scand J Stat. 1984;11:265--270.
-   **Pielou 1966:** Pielou EC. *The measurement of diversity in
    different types of biological collections.* J Theor Biol.
    1966;13:131--144.

- **Kleine Bardenhorst et al. 2021:** *Data Analysis Strategies for Microbiome Studies in Human Populations—a Systematic Review of Current Practice.* mSystems. 2021;6:e01154-20. doi:10.1128/mSystems.01154-20. Supports matching analysis to cross-sectional, predictive, treatment, clustered, and longitudinal study designs.
- **Methodological Considerations in Longitudinal Analyses of Microbiome Data (2024):** reviews how repeated sampling can characterize disease progression, treatment effects, host–microbiome dynamics, and microbial trajectories while requiring explicit handling of within-subject correlation.
- **Insights into study design and statistical analyses in translational microbiome studies:** emphasizes aligning sampling design with translational goals including diagnosis, disease monitoring, treatment response, and therapeutic development.
- **Anti-TNF Crohn's example (Sci Rep 2021):** alpha diversity increased in treatment responders relative to non-responders, illustrating alpha diversity as a treatment-response ecological phenotype rather than only a case/control descriptor.

## Runtime citation policy

Before surfacing literature support in a gate note or final References
page, resolve the relevant source through the project's literature
retrieval system and attach the exact passage supporting the claim.
Disease-specific expectations must be retrieved for the actual phenotype
under analysis rather than copied from the CRC example above.
