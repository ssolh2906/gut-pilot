# Gut Pilot --- Step 6: Beta Diversity

``` yaml
step_id: beta_diversity
page_key: beta
gate_ids: [G9]
inputs:
  [diversity_analysis_table, group_assignment, batch_handling,
   dependence_structure, covariates, significance_settings,
   rarefaction_metadata, phylogenetic_tree_optional,
   clr_aitchison_sensitivity_optional, study_question]
outputs:
  [distance_matrices, ordinations, permanova_results,
   dispersion_results, effect_size_summary, study_context_interpretation,
   metric_concordance, sensitivity_results, gate_note,
   agent_interpretation_card]
```

## Scientific purpose

Beta diversity asks:

> **How different are microbial communities between samples, and are
> those between-sample differences systematically associated with the
> biological or clinical comparison in this study?**

Where alpha diversity asks how diverse each individual sample is, beta
diversity asks whether **the identities and/or abundances of organisms
differ across samples**.

This is a community-level analysis. It can show that disease, treatment,
response, time, site, or another factor is associated with a shift in
the microbiome as a whole, even when alpha diversity is unchanged.

It does **not** by itself identify which taxa drive the shift. That is
the hand-off to differential abundance in Step 7.

A useful beta-diversity analysis should answer:

1.  Are samples within the same biological group more compositionally
    similar to one another than to samples in the comparison group?
2.  How large is the group-associated community difference?
3.  Is the signal a shift in the group's typical composition, increased
    heterogeneity/instability, or both?
4.  Is the result robust to different scientifically justified
    definitions of community difference?
5.  Is the apparent biological effect actually explained by batch, site,
    subject, or another confounder?
6.  What does the result mean given the unit of comparison and temporal
    structure of the study?
7.  What taxon-level or mechanistic analysis should follow?

A null beta-diversity result is meaningful: it means the selected
distance metrics do not support a systematic community-level difference
under the tested design. It does not prove that no individual taxa
differ.

------------------------------------------------------------------------

# Interpret beta diversity through the study design

Before computing inference, formulate the scientific question from the
study's unit of comparison.

  ----------------------------------------------------------------------------------
  Unit of           Scientific          Potentially          Strongest
  comparison        beta-diversity      interesting finding  interpretation
                    question                                 typically permitted
  ----------------- ------------------- -------------------- -----------------------
  Case vs control   Is disease status   Cases occupy a       Disease-associated
                    associated with     reproducibly shifted community difference
                    overall community   community state      
                    composition?                             

  Treatment vs      Does the            Treatment produces a Treatment-associated
  control           intervention alter  community-level      shift; causal treatment
                    overall microbiome  shift                effect only when design
                    composition?                             supports it

  Pre vs post       Does an             Within-person        Treatment-associated
  treatment         individual's        community change     within-person change
                    microbiome move     after exposure       
                    after treatment?                         

  Responder vs      Do response         Responders separate  Response-associated
  non-responder     phenotypes occupy   at baseline or       ecological phenotype
                    different           diverge during       
                    microbiome states?  therapy              

  Baseline → future Does baseline       Future outcome       Candidate
  outcome           community state     groups differ before prognostic/predictive
                    predict later       outcome occurs       community biomarker
                    response/relapse?                        

  Longitudinal      Do microbial        One group returns    Differential ecological
  trajectory        communities evolve  toward               trajectory / resilience
                    differently over    baseline/reference   
                    time?               while another        
                                        remains displaced    

  Continuous        Does community      A clinical gradient  Phenotype-associated
  phenotype         composition vary    explains community   community gradient
                    with inflammation,  variation            
                    dose, severity,                          
                    metabolite level,                        
                    etc.?                                    

  Multi-site /      How much variation  Biological effect    More credible
  multi-batch       is attributable to  persists after       biological community
                    biology versus      accounting for       association
                    technical/site      site/batch           
                    effects?                                 
  ----------------------------------------------------------------------------------

The agent must explicitly distinguish **cross-sectional separation**,
**within-person movement**, **baseline prediction**, and **longitudinal
divergence**. These are scientifically different findings.

------------------------------------------------------------------------

# Formulate the question before testing

``` yaml
scientific_question:
  unit_of_comparison: <case_vs_control |
                       treatment_vs_control |
                       pre_vs_post |
                       responder_vs_nonresponder |
                       longitudinal |
                       continuous_clinical_trait |
                       other>
  contrast: <plain-language contrast>
  temporal_ordering: <cross_sectional |
                      microbiome_before_outcome |
                      intervention_before_microbiome |
                      repeated_over_time>
  primary_factor: <metadata variable>
  adjustment_variables: [...]
  permutation_restriction: <subject|batch|site|none>
  scientific_question: <one sentence>
  strongest_permitted_interpretation:
    <association |
     treatment_effect |
     within_person_change |
     prognostic_association |
     longitudinal_trajectory>
```

Do not scan all metadata columns for the smallest PERMANOVA p-value. The
primary comparison comes from Step 2/the study question. Additional
metadata hypotheses are exploratory and must be labeled as such.

------------------------------------------------------------------------

# G9 --- Beta-diversity metric and inference plan

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  Gate     Decision          Options → when to pick   Default                    Diagnostics to compute  Method / test         Key pitfall         Evidence
                                                                                 first                                                             
  -------- ----------------- ------------------------ -------------------------- ----------------------- --------------------- ------------------- -----------------
  G9       Primary distance  Bray--Curtis / Jaccard / **Bray--Curtis as the      Tree availability;      Distance matrix +     Treating all        BrayCurtis1957;
           metric            Aitchison / weighted or  conventional primary       sparsity/prevalence;    PCoA; PERMANOVA with  metrics as          Jaccard1901;
                             unweighted UniFrac when  abundance-sensitive metric Step-4 normalization    design-aware          interchangeable or  Lozupone2005;
                             a valid tree exists      for genus-level 16S        path; abundance         permutations;         selecting whichever Lozupone2007;
                                                      without a tree.** Add      distribution; study     PERMDISP/betadisper   produces the        Gloor2017;
                                                      Jaccard as a               question                                      smallest p-value    Martino2019
                                                      presence/absence                                                                             
                                                      sensitivity. If Step 4                                                                       
                                                      specifies compositional                                                                      
                                                      beta sensitivity, add                                                                        
                                                      robust CLR/Aitchison. If a                                                                   
                                                      valid tree exists, add                                                                       
                                                      weighted/unweighted                                                                          
                                                      UniFrac according to the                                                                     
                                                      scientific question                                                                          

  G9       Community-level   Unadjusted PERMANOVA vs  **Inherit G2/G3.** Adjust  Batch/group/site        PERMANOVA; default    Ignoring batch,     Anderson2001
           inference         covariate-adjusted       for prespecified           cross-tabs; subject     999 permutations,     site, or repeated   
                             PERMANOVA/adonis-style   confounders and restrict   structure; covariates;  increase when more    subjects can make   
                             model                    permutations where         sample counts           precise tail          technical or        
                                                      dependence/blocking                                probabilities are     within-person       
                                                      requires it                                        needed                similarity look     
                                                                                                                               like biological     
                                                                                                                               separation          

  G9       Dispersion        Always evaluate group    Always report alongside    Distance-to-centroid    PERMDISP / betadisper PERMANOVA can be    Anderson2006
                             dispersion for           PERMANOVA                  distributions by group                        affected by         
                             categorical group                                                                                 heterogeneous       
                             comparisons                                                                                       dispersion; a       
                                                                                                                               significant result  
                                                                                                                               is not              
                                                                                                                               automatically a     
                                                                                                                               pure                
                                                                                                                               centroid/location   
                                                                                                                               shift               

  ---      Effect magnitude  PERMANOVA R² / partial   Always report R² with p/q  Compare R² for          PERMANOVA variance    "Significant        Anderson2001
                             R² plus                                             biological factor with  partitioning          separation" can     
                             uncertainty/context                                 batch/site/covariates                         describe a tiny     
                                                                                 where modeled                                 effect in a large   
                                                                                                                               sample              

  ---      Ordination        PCoA for distance        PCoA for conventional      Eigenvalues; variance   PCoA                  Visual overlap does Standard
                             matrices; robust         distances; retain %        explained; potential                          not invalidate      ordination
                             Aitchison PCA/biplot for variance explained on axes negative eigenvalues                          PERMANOVA; visual   practice
                             DEICODE-style                                       where relevant                                separation does not 
                             sensitivity                                                                                       establish           
                                                                                                                               significance. A 2-D 
                                                                                                                               plot is only a      
                                                                                                                               projection of the   
                                                                                                                               full distance       
                                                                                                                               matrix              

  ---      Metric            Primary metric only vs   Interpret                  Results across          Structured            Calling             Annual Reviews
           concordance       prespecified sensitivity concordance/disagreement   abundance-sensitive,    sensitivity analysis  disagreement        2024; Martino2019
                             metrics                  across metrics             presence/absence,                             "failed             
                                                      biologically; do not       phylogenetic, and                             replication" when   
                                                      require universal          compositional distances                       metrics emphasize   
                                                      agreement                                                                different           
                                                                                                                               biological aspects  
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# What each distance metric means biologically

## 1. Bray--Curtis --- abundance-sensitive ecological difference

Bray--Curtis asks approximately:

> **How different are these samples in the abundances of the taxa they
> contain?**

Two samples containing the same genera can still be far apart if their
abundance profiles are very different.

Example:

``` text
Sample A:  Bacteroides 70%, Faecalibacterium 20%, others 10%
Sample B:  Bacteroides 20%, Faecalibacterium 65%, others 15%
```

Their richness could be identical and their alpha diversity similar,
while Bray--Curtis identifies a strong compositional difference.

**Use when:** abundance shifts among observed taxa are biologically
important.

**Default:** primary conventional metric for genus-level 16S data when
no phylogenetic tree is available.

------------------------------------------------------------------------

## 2. Jaccard --- presence/absence community membership

Jaccard ignores abundance and asks:

> **Do the same taxa occur in both samples?**

This can detect community membership changes that Bray--Curtis may
de-emphasize.

Biologically, a Jaccard signal with little Bray--Curtis signal suggests
that groups may differ mainly in **which lower-prevalence taxa are
present**, rather than major changes among dominant taxa.

Because rare detections are sensitive to sequencing depth and technical
noise, interpret Jaccard in light of Step-3/4 QC and prevalence.

------------------------------------------------------------------------

## 3. Weighted and unweighted UniFrac --- phylogenetic community difference

If a validated phylogenetic tree is available:

-   **Unweighted UniFrac** asks whether samples contain different
    phylogenetic lineages, emphasizing presence/absence.
-   **Weighted UniFrac** additionally incorporates abundance,
    emphasizing abundant phylogenetic differences.

These can reveal that groups differ not simply by named genera but by
broader evolutionary lineages.

Do not compute UniFrac without a valid phylogenetic tree.

If unavailable, state this explicitly rather than silently hiding the
metric.

------------------------------------------------------------------------

## 4. Aitchison / robust Aitchison --- compositional difference

Microbiome sequencing data are compositional: abundances are observed
relative to the rest of the community.

Aitchison distance compares samples in log-ratio space.

For sparse microbiome data, robust Aitchison approaches such as DEICODE
can avoid naive pseudocount dependence and provide compositional
ordination with feature loadings.

Use as the compositional pathway specified in Step 4, particularly as a
sensitivity analysis.

Never compute Bray--Curtis on CLR-transformed values.

------------------------------------------------------------------------

# Analysis algorithm

## 1. Confirm the analysis population and study design

Before calculating distances:

-   inherit Step-4 diversity sample inclusion/exclusion;
-   inherit G2 batch/site handling;
-   inherit G3 subject pairing/clustering;
-   identify the primary biological contrast;
-   identify prespecified adjustment variables;
-   identify valid permutation restrictions;
-   confirm whether a phylogenetic tree exists;
-   confirm which normalization/transform corresponds to each distance
    metric.

Do not independently redefine groups on this page.

------------------------------------------------------------------------

## 2. Compute a prespecified distance panel

For conventional genus-level 16S without a tree:

**Primary** - Bray--Curtis.

**Sensitivity** - Jaccard. - robust CLR/Aitchison if Step 4 requested
compositional sensitivity.

With a valid tree, additionally consider:

-   weighted UniFrac;
-   unweighted UniFrac.

Do not choose the "winning" distance after seeing results.

Record which metric was primary before inference.

------------------------------------------------------------------------

## 3. Visualize community structure with ordination

Perform PCoA on each conventional distance matrix.

The plot must show:

-   individual samples;
-   biological group;
-   PC1 and PC2 percentage of distance variation represented;
-   optionally confidence ellipses/centroids for descriptive guidance;
-   batch/site shapes or faceting when confounding is relevant;
-   subject trajectories/connecting lines for appropriate paired
    longitudinal displays.

For robust Aitchison, use the corresponding compositional PCA/biplot
where available.

The agent must say:

> "This 2-D ordination is a visualization of the full pairwise distance
> structure, not the statistical test itself."

Do not infer significance from visual cluster separation.

------------------------------------------------------------------------

## 4. Run design-aware PERMANOVA

PERMANOVA tests whether the multivariate community structure is
associated with the factor of interest.

A simple model may be:

``` text
distance ~ disease_status
```

With confounders:

``` text
distance ~ batch + site + age + sex + disease_status
```

The precise formula and term ordering must be prespecified according to
the implementation and scientific estimand. If sequential sums of
squares are used, term order can affect results; do not let the agent
reorder covariates to improve significance.

For repeated measures or blocked designs, permutations must respect the
valid exchangeability structure, for example restricting permutations
within subject/block where appropriate.

The agent must never treat unrestricted permutations as valid when G3
established non-independence.

Use at least 999 permutations by default. Increase the number when a
more precise small p-value is needed and computationally feasible.

------------------------------------------------------------------------

## 5. Always quantify effect magnitude

Report:

``` text
PERMANOVA R²
p-value
adjusted q-value when multiple beta hypotheses are inferential
```

R² answers approximately:

> **What fraction of variation in the distance matrix is associated with
> this factor under the fitted model?**

Example:

``` text
Disease R² = 0.032
Batch   R² = 0.118
```

The scientifically important message is not merely:

> "Disease is significant."

It is:

> "Disease status explains a small fraction of community variation,
> while batch explains substantially more."

That may fundamentally change confidence in the biological
interpretation.

Do not apply arbitrary universal labels such as "R² \< 0.05 = weak."
Interpret magnitude relative to design, field context, covariates,
sample size, and reproducibility.

------------------------------------------------------------------------

## 6. Always evaluate dispersion

For categorical comparisons, compute PERMDISP/betadisper and visualize
distance to group centroid.

This separates two related possibilities:

``` text
A. LOCATION SHIFT

controls:   ●●●
cases:                 ●●●

Typical community composition differs.


B. DISPERSION SHIFT

controls:      ●●●
cases:      ●       ●
                ●
             ●

One group is more heterogeneous.
```

If PERMANOVA is significant and PERMDISP is not:

> Evidence is more consistent with a shift in community
> location/centroid than with a simple dispersion difference.

If both are significant:

> The groups differ in multivariate structure, but unequal within-group
> dispersion contributes to the signal; do not describe the result as an
> unqualified centroid shift.

If PERMDISP alone is significant:

> The most prominent community-level finding may be altered
> **heterogeneity** rather than a systematic shift in typical
> composition.

That can itself be biologically interesting. Increased dispersion may
reflect ecological instability, heterogeneous disease subtypes, variable
treatment response, or unmeasured confounding. These are hypotheses, not
automatic conclusions.

------------------------------------------------------------------------

# Interpret concordance across metrics

Different metrics answer different biological questions.

### Bray--Curtis significant; Jaccard not

Likely interpretation:

> Groups differ primarily in the **relative abundance of taxa already
> shared across groups**, rather than wholesale presence/absence of
> taxa.

### Jaccard significant; Bray--Curtis weak

Likely interpretation:

> Community membership differs, potentially involving lower-prevalence
> taxa, while dominant abundance structure is more similar.

Check sequencing depth, prevalence, and technical robustness carefully.

### Weighted UniFrac significant; unweighted weak

Likely interpretation:

> Differences are concentrated in the abundance of phylogenetic lineages
> rather than simple lineage presence/absence.

### Unweighted UniFrac significant; weighted weak

Likely interpretation:

> Lower-abundance phylogenetic membership differs more than dominant
> lineage abundance.

### Bray/Jaccard weak; Aitchison robust

Possible interpretation:

> The strongest signal is in relative log-ratio structure rather than
> conventional ecological distance.

Investigate feature loadings and Step-7 DA rather than declaring one
metric "correct."

### All prespecified metrics agree

> Evidence for a broad community-level difference is more robust to how
> community difference is defined.

Agreement strengthens robustness but does not identify causal taxa.

------------------------------------------------------------------------

# Interpret beta diversity through biological context

## Case--control study

Interesting result:

> Cases occupy a different community state from controls after
> adjustment for batch/site.

What it teaches:

> Disease status is associated with community composition beyond overall
> within-sample diversity.

Next question:

> Which taxa or functions drive the difference?

------------------------------------------------------------------------

## Randomized treatment study

Interesting result:

> Treatment allocation produces increasing community separation from
> control over follow-up.

If randomization, adherence, missingness, and analysis are appropriate,
this can support a treatment effect on microbiome community composition.

Next questions:

-   Which taxa/pathways changed?
-   Is the microbiome change related to drug exposure/dose?
-   Does the community shift mediate or merely accompany the clinical
    effect?

Do not claim mediation from beta diversity alone.

------------------------------------------------------------------------

## Pre/post observational treatment study

Interesting result:

> Within-person communities move systematically after treatment.

Interpret as treatment-associated change, not necessarily causal,
because time, diet, disease course, antibiotics, and other exposures may
co-vary.

A paired/longitudinal analysis is essential.

------------------------------------------------------------------------

## Treatment-response study

Two especially interesting patterns exist.

### Baseline separation

``` text
BEFORE TREATMENT:

responders      ●●●

nonresponders                ●●●
```

Potential meaning:

> Baseline microbiome state may be a candidate predictor of response.

This is stronger scientifically when microbiome sampling clearly
precedes outcome ascertainment and the association persists after
clinical covariate adjustment.

### Divergent trajectories

``` text
Responders:      baseline ● ─────────→ healthy/reference region
Nonresponders:   baseline ● ─→ remains displaced
```

Potential meaning:

> Ecological response to therapy tracks clinical response.

This generates hypotheses about microbiome recovery, resilience, and
treatment mechanism.

------------------------------------------------------------------------

## Longitudinal disease study

Beta diversity can quantify:

-   stability within individuals;
-   departure from baseline;
-   recovery after perturbation;
-   convergence toward a reference state;
-   divergence between disease trajectories.

A biologically interesting endpoint may therefore be **distance traveled
from baseline** rather than only case/control clustering.

Do not reduce rich longitudinal data to an ordinary cross-sectional
PERMANOVA when a trajectory question is scientifically primary.

------------------------------------------------------------------------

## Prognostic study

If baseline samples separate patients who later relapse versus remain
stable:

> Baseline community composition is associated with future outcome and
> may represent a candidate prognostic microbiome signature.

This should trigger downstream predictive validation rather than being
presented as a clinically useful biomarker from PERMANOVA alone.

------------------------------------------------------------------------

# Relation to alpha diversity

Alpha and beta diversity answer orthogonal questions.

Example:

``` text
             ALPHA             BETA
Cases        Shannon = 4.0
Controls     Shannon = 4.0      strong separation
```

This is completely possible.

It means:

> Both groups contain communities of similar overall ecological
> diversity, but they contain different organisms and/or abundance
> structures.

This is often biologically more informative than a generic "loss of
diversity" narrative.

The agent should explicitly synthesize Step 5 + Step 6:

``` yaml
alpha_beta_synthesis:
  alpha_result: <description>
  beta_result: <description>
  interpretation: <joint biological meaning>
```

Example:

> "Alpha diversity was preserved, but beta diversity differed by disease
> status. The disease association therefore appears to involve community
> restructuring rather than a broad loss of within-sample diversity."

------------------------------------------------------------------------

# Higher-value scientific questions

After completing the prespecified primary analysis, inspect whether the
uploaded study design supports a more informative **predeclared
secondary proposal**.

Potential variables include:

-   treatment/exposure;
-   dose;
-   time;
-   clinical response;
-   disease severity;
-   relapse;
-   inflammatory markers;
-   metabolites;
-   diet;
-   antibiotics;
-   site;
-   host genotype.

The agent may propose, but must not silently execute a large metadata
fishing expedition.

Examples:

> "Because baseline samples and later treatment-response labels are
> available, a more translational secondary question is whether
> pretreatment community composition differs between future responders
> and non-responders."

> "Because repeated samples exist, a more biologically informative
> analysis is whether each patient's microbiome returns toward baseline
> after antibiotic cessation."

Require human approval for newly generated exploratory hypotheses when
they materially expand the prespecified analysis.

------------------------------------------------------------------------

# Multiple testing

If only one primary beta-diversity hypothesis and one prespecified
primary distance metric exist, report that primary inference directly.

If several distance metrics or pairwise group comparisons are treated as
inferential claims:

-   define the hypothesis family prospectively;
-   retain raw p-values;
-   apply BH or another prespecified correction within that family;
-   distinguish primary from sensitivity analyses.

Do not count sensitivity metrics as independent biological replications.

Do not combine beta-diversity p-values with hundreds of Step-7
taxon-level tests in one correction family.

------------------------------------------------------------------------

# Sensitivity and robustness

Trigger additional scrutiny when:

-   Step 4's rarefaction decision was fragile;
-   group exclusions were asymmetric;
-   batch/site explains substantial community variation;
-   PERMDISP is significant;
-   the primary result changes across reasonable distance metrics;
-   longitudinal dependence is complex;
-   ordination is driven by a small number of extreme samples.

Possible sensitivity analyses:

1.  nearby defensible rarefaction depth;
2.  Jaccard versus Bray--Curtis;
3.  robust Aitchison compositional analysis;
4.  weighted/unweighted UniFrac when a valid tree exists;
5.  model with/without a prespecified questionable confounder;
6.  influence analysis for extreme samples without silently deleting
    them.

Report whether the main biological conclusion is robust.

------------------------------------------------------------------------

# Wet-lab-facing result card

Do not lead with "PERMANOVA p=0.002."

Example:

> ## Disease is associated with a modest shift in overall microbiome composition
>
> **Scientific question:** We tested whether CRC cases and controls
> differed in their overall genus-level microbial community composition.
>
> **What we checked:** We compared abundance-weighted community
> differences using Bray--Curtis distance, visualized the full community
> structure with PCoA, tested the disease association with PERMANOVA
> while accounting for the prespecified study design, and tested whether
> one group was simply more heterogeneous using PERMDISP.
>
> **Result:** Disease status was associated with community composition
> (PERMANOVA R²=3.8%, q=0.01). Dispersion did not differ detectably
> between groups. The result was directionally consistent using the
> prespecified compositional sensitivity analysis.
>
> **Interpretation:** CRC is associated with a reproducible but modest
> restructuring of the microbial community rather than a large wholesale
> separation of case and control microbiomes. Because alpha diversity
> was similar in Step 5, the signal appears to reflect **which organisms
> and abundance patterns make up the community**, not a broad loss of
> diversity.
>
> **What this does not tell us:** Beta diversity does not identify which
> genera drive the difference or establish that the microbiome causes
> CRC.
>
> **Next biological question:** Which taxa account for the community
> shift, and do they correspond to known or novel CRC-associated
> organisms? Step 7 addresses this with differential abundance.

The numbers and language must be generated from the actual run.

------------------------------------------------------------------------

# Hard-stop / escalation conditions

Require human review rather than producing an unqualified biological
conclusion when:

-   the primary biological factor is nearly or perfectly confounded with
    batch/site;
-   permutation restrictions required by G3 cannot be implemented
    correctly;
-   too few independent subjects remain for meaningful permutation
    inference;
-   a significant PERMANOVA is accompanied by strong dispersion
    differences and the intended claim is specifically a centroid shift;
-   the chosen distance metric is incompatible with the Step-4
    transform;
-   a requested UniFrac analysis lacks a valid phylogenetic tree;
-   results are driven by obvious technical outliers or an unresolved QC
    problem;
-   the agent cannot identify a scientifically valid exchangeability
    structure for permutations.

------------------------------------------------------------------------

# Agent instructions

1.  Explain beta diversity as **between-sample community difference**
    before presenting statistics.
2.  Formulate the biological/clinical question from the unit of
    comparison before testing.
3.  Inherit group definitions, confounders, batch handling, subject
    dependence, and sample exclusions from earlier steps.
4.  Do not search metadata indiscriminately for significant PERMANOVA
    results.
5.  Prespecify a primary distance metric before inspecting significance.
6.  Use Bray--Curtis as the conventional primary abundance-sensitive
    metric for genus-level 16S without a tree unless the scientific
    question dictates otherwise.
7.  Use Jaccard as a presence/absence sensitivity when scientifically
    useful.
8.  Use weighted/unweighted UniFrac only with a valid phylogenetic tree.
9.  Use the Step-4 CLR/robust-Aitchison pathway when compositional beta
    sensitivity is requested.
10. Never calculate Bray--Curtis on CLR values.
11. Visualize distances with PCoA but never infer significance from the
    plot alone.
12. Report the variance represented by displayed ordination axes.
13. Use design-aware PERMANOVA with prespecified covariates.
14. Restrict permutations according to G3/blocking when required.
15. Report PERMANOVA R² together with p/q.
16. Never describe a small R² merely as "clear separation."
17. Evaluate PERMDISP/betadisper for categorical group comparisons.
18. Distinguish a centroid/community-state shift from altered
    heterogeneity.
19. Treat increased dispersion as a potentially interesting ecological
    phenotype, but do not assign a mechanism without evidence.
20. Interpret metric disagreement according to what each distance
    emphasizes.
21. Do not select whichever metric gives the smallest p-value.
22. Synthesize Step-5 alpha and Step-6 beta results.
23. For longitudinal data, consider trajectory/distance-from-baseline
    questions rather than reducing everything to cross-sectional
    grouping.
24. For baseline samples with future outcomes, recognize candidate
    prognostic/predictive questions.
25. For randomized interventions, distinguish a potentially causal
    treatment effect from mediation.
26. Trigger sensitivity analyses when normalization, dispersion,
    confounding, or metric choice makes the result fragile.
27. State explicitly that beta diversity does not identify the taxa
    driving the difference.
28. End with the scientifically motivated hand-off to Step 7 or a
    higher-value longitudinal/predictive analysis.
29. Produce a wet-lab-facing interpretation answering: **what
    communities were compared, how they differed, how large the
    difference was, whether it reflects location or heterogeneity, how
    robust it is, what we can infer, and what to investigate next.**

------------------------------------------------------------------------

# Required outputs

``` yaml
beta_diversity:
  status: PASS | PASS_WITH_FLAGS | HUMAN_REVIEW_REQUIRED | HARD_STOP

  scientific_question:
    unit_of_comparison: <value>
    primary_factor: <value>
    contrast: <text>
    temporal_ordering: <value>
    strongest_permitted_interpretation: <value>

  analysis_population:
    n_total_project: <int>
    n_beta_analysis: <int>
    by_group: {...}
    samples_excluded: [...]
    independent_subjects: <int|null>

  metrics:
    primary: <bray_curtis|jaccard|aitchison|weighted_unifrac|unweighted_unifrac>
    sensitivity: [...]
    phylogenetic_tree_available: true | false

  statistical_design:
    formula: <text>
    covariates: [...]
    permutation_restriction: <value|null>
    permutations: <int>

  results:
    - metric: <name>
      permanova:
        r2: <float>
        pseudo_f: <float>
        raw_p: <float>
        adjusted_q: <float|null>
      dispersion:
        statistic: <float>
        raw_p: <float>
        adjusted_q: <float|null>
      interpretation:
        centroid_shift_supported: true | false | uncertain
        dispersion_difference: true | false | uncertain

  ordination:
    method: <PCoA|robust_aitchison_PCA>
    axis_1_variance: <float|null>
    axis_2_variance: <float|null>
    visual_description: <text>

  metric_concordance:
    pattern: <text>
    biological_interpretation: <text>

  alpha_beta_synthesis:
    alpha_result: <text>
    beta_result: <text>
    joint_interpretation: <text>

  confounding_context:
    biological_factor_r2: <float|null>
    batch_r2: <float|null>
    site_r2: <float|null>
    warning: <text|null>

  sensitivity:
    required: true | false
    analyses: [...]
    conclusion_stable: true | false | unknown

  higher_value_questions:
    proposed: [...]
    human_approval_required: true | false

  wetlab_summary:
    headline: <text>
    scientific_question: <text>
    what_we_checked: <text>
    result: <text>
    ecological_interpretation: <text>
    inferential_limit: <text>
    robustness: <text>
    next_question: <text>
```

------------------------------------------------------------------------

# Evidence

-   **Anderson 2001:** Anderson MJ. *A new method for non-parametric
    multivariate analysis of variance.* Austral Ecology. 2001;26:32--46.
    Foundational PERMANOVA reference.
-   **Anderson 2006:** Anderson MJ. *Distance-based tests for
    homogeneity of multivariate dispersions.* Biometrics.
    2006;62:245--253. Foundational dispersion/PERMDISP reference.
-   **Bray & Curtis 1957:** Bray JR, Curtis JT. *An ordination of the
    upland forest communities of southern Wisconsin.* Ecological
    Monographs. 1957;27:325--349.
-   **Jaccard 1901:** Jaccard P. Original presence/absence similarity
    formulation.
-   **Lozupone & Knight 2005:** Lozupone C, Knight R. *UniFrac: a new
    phylogenetic method for comparing microbial communities.* Applied
    and Environmental Microbiology. 2005;71:8228--8235.
-   **Gloor et al. 2017:** Gloor GB, Macklaim JM, Pawlowsky-Glahn V,
    Egozcue JJ. *Microbiome Datasets Are Compositional: And This Is Not
    Optional.* Front Microbiol. 2017;8:2224.
    doi:10.3389/fmicb.2017.02224.
-   **Martino et al. 2019:** Martino C, Morton JT, Marotz CA, et al. *A
    Novel Sparse Compositional Technique Reveals Microbial
    Perturbations.* mSystems. 2019;4:e00016-19.
    doi:10.1128/mSystems.00016-19. Introduces robust Aitchison
    PCA/DEICODE for sparse compositional microbiome data.
-   **Recent statistical review:** *Analysis of Microbiome Data.* Annual
    Review of Statistics and Its Application. Reviews common
    beta-diversity choices including Jaccard, Bray--Curtis, unweighted
    UniFrac, and weighted UniFrac.
-   **QIIME 2 diversity documentation:** Current QIIME 2 supports
    distance matrices, PCoA, PERMANOVA, PERMDISP, pairwise group
    testing, phylogenetic/non-phylogenetic beta diversity, and
    longitudinal workflows.

## Runtime citation policy

Before surfacing literature support in a gate note or final References
page, resolve the relevant source through the project's literature
retrieval system and attach the exact passage supporting the claim.

Disease-, treatment-, and phenotype-specific interpretations must be
retrieved for the actual study context. Do not hardcode the examples
above as universal biological expectations.
