# Gut Pilot --- Step 4: Normalization / Diversity Standardization

``` yaml
step_id: normalization
page_key: rarefy
gate_ids: [G6, G7]
inputs: [working_count_table, group_assignment, batch_handling, dependence_structure, depth_diagnostics, candidate_low_depth_samples]
outputs: [analysis_plan, diversity_standardization, rarefaction_depth, excluded_samples, retention_diagnostics, sensitivity_plan, gate_notes, agent_proposal_card]
```

## Scientific purpose

Choose how unequal sequencing effort will be handled for each downstream
scientific question and, if equal-depth rarefaction is used for
diversity, choose a defensible sampling depth without silently changing
the study population.

**Do not force one normalized table to serve every downstream
analysis.** Alpha/beta diversity and differential-abundance (DA) testing
answer different questions and have different statistical requirements.

The default plan for conventional 16S amplicon data is:

-   **Alpha diversity:** equal-depth rarefaction/resampling for the
    conventional analysis; optionally add coverage-based diversity when
    richness/sample completeness is central.
-   **Beta diversity:** equal-depth rarefaction for conventional
    Bray--Curtis, Jaccard, and UniFrac analyses; optionally add CLR +
    Aitchison as a compositional sensitivity analysis.
-   **Differential abundance:** preserve the original unrarefied integer
    counts and let each DA method perform its appropriate
    normalization/transformation in Step 7.
-   **CSS:** do not present as a co-equal global default; use only when
    a specific downstream method/workflow calls for it.

This analysis-specific routing is more scientifically defensible than
asking the user to select one global option such as "rarefaction vs CSS
vs CLR."

------------------------------------------------------------------------

## G6 --- Analysis-specific normalization / standardization plan

  -----------------------------------------------------------------------------------------------------------------------------------------------
  Gate     Decision     Options → when to pick          Default        Diagnostics to compute  Method / test       Key pitfall     Evidence
                                                                       first                                                       
  -------- ------------ ------------------------------- -------------- ----------------------- ------------------- --------------- --------------
  G6       How to       **Diversity:** equal-depth      Route methods  Step-3 depth            Analysis-specific   Treating        Weiss2017;
           handle       rarefaction/resampling for      by estimand:   distribution; depth ×   routing rather than normalization   MH2014;
           unequal      conventional alpha/beta         rarefaction    group/batch             one global          as one          Gloor2017;
           sequencing   metrics; **Compositional beta   for            relationship;           normalization       irreversible    Schloss2024;
           effort       sensitivity:** CLR + Aitchison; conventional   preliminary                                 preprocessing   Nearing2022;
           across       **DA:** unrarefied counts with  alpha/beta     alpha-rarefaction                           step.           ChaoJost2012
           downstream   method-specific                 diversity;     curves;                                     Rarefaction,    
           analyses     normalization/transformation;   preserve raw   sample-retention curve;                     CLR, and CSS    
                        **CSS:** only for a workflow    counts for DA; sample                                      solve different 
                        that specifically requires it   optionally add completeness/coverage                       statistical     
                                                        Aitchison beta where available;                            problems and    
                                                        sensitivity    sparsity/zero burden                        should not      
                                                                       for CLR feasibility                         automatically   
                                                                                                                   feed every      
                                                                                                                   downstream      
                                                                                                                   statistic       

  -----------------------------------------------------------------------------------------------------------------------------------------------

### G6 decision logic

1.  **Preserve raw counts.** Keep an immutable copy of the validated raw
    integer count table. No transformation or resampling on this page
    may overwrite it.

2.  **Conventional alpha diversity.** For observed richness, Shannon,
    Simpson, Chao1, and related ecological metrics, propose equal-depth
    rarefaction/resampling as the primary conventional standardization.
    Observed diversity---especially richness---depends on sampling
    effort. Rarefaction remains standard in major amplicon workflows
    such as QIIME 2, and Schloss (2024) found it particularly effective
    at removing sequencing-depth dependence from alpha/beta metrics. Do
    not claim that rarefaction solves diversity estimation:
    Willis (2019) emphasizes uncertainty from unobserved taxa.

3.  **Coverage-based alpha sensitivity.** If richness/sample
    completeness is a central endpoint, communities differ strongly in
    richness, or equal-depth comparison appears questionable, offer
    coverage-based rarefaction/extrapolation using the Chao/Jost
    Hill-number framework. This compares communities at similar
    estimated completeness rather than merely equal read counts.

4.  **Conventional beta diversity.** For Bray--Curtis, Jaccard, and
    UniFrac, propose equal-depth rarefaction as the primary conventional
    workflow. If compositional analysis is desired and zero handling is
    defensible, optionally run
    `zero handling → CLR → Euclidean/Aitchison distance` as a separate
    sensitivity analysis. Never compute Bray--Curtis on CLR values.

5.  **Differential abundance.** Do not rarefy the DA input merely
    because diversity was rarefied. Preserve raw counts for ALDEx2,
    ANCOM-BC, and other Step-7 methods, each of which receives the input
    its model expects.

6.  **CSS.** CSS is a scaling procedure for sparse count data and
    remains relevant to workflows such as metagenomeSeq, but it does not
    solve the same problem as equal-depth diversity standardization or
    compositional log-ratio analysis. Select it only when a downstream
    method specifically calls for it or as an explicitly requested
    sensitivity analysis. When the user chooses CSS, cite
    Paulson et al. (2013), doi:10.1038/nmeth.2658.

### What the wet-lab user should see for G6

> **Reviewer proposal --- use analysis-specific normalization**
>
> Your samples vary substantially in sequencing depth, and cases are
> modestly shallower than controls. Because unequal sequencing effort
> can distort diversity comparisons, I recommend equal-depth rarefaction
> for alpha and conventional beta diversity. I will **not** discard the
> original counts: differential-abundance testing will use the full
> unrarefied table with each DA method's own correction. CLR/Aitchison
> will remain available as an optional compositional beta-diversity
> sensitivity analysis.
>
> **Checks run:** sequencing-depth distribution ✓; depth by group ✓;
> depth by batch ✓; sample-retention curve ✓; rarefaction curves ✓.
>
> **Why:** this separates the sequencing-effort problem in ecological
> diversity from the compositional/statistical problem in taxon-level
> differential abundance.

The detailed methodological debate should be expandable rather than
required reading before approval.

### Methodological debate to expose on request

-   **Rarefaction/community diversity:** rarefaction remains widely used
    for amplicon alpha/beta diversity. Weiss et al. (2017) showed
    normalization performance depends on dataset characteristics;
    Schloss (2024) argues from simulations that rarefaction provides
    strong control of sequencing-effort effects on alpha/beta diversity.
-   **Information loss:** McMurdie & Holmes (2014) argue against
    rarefying because valid reads are discarded and power can be lost,
    particularly for taxon-level DA. Repeating subsampling reduces Monte
    Carlo randomness but **does not restore discarded information**.
-   **Compositional analysis:** Gloor et al. (2017) emphasize that
    sequencing data are compositional and motivate log-ratio analyses
    and Aitchison geometry.
-   **Sample completeness:** Chao & Jost (2012) show equal read counts
    do not necessarily mean equal sample completeness. Coverage-based
    rarefaction/extrapolation can therefore be preferable for
    richness/diversity comparisons when completeness differs.

Practical synthesis:

``` text
                    RAW INTEGER COUNTS
                           |
          +----------------+----------------+
          |                                 |
   COMMUNITY DIVERSITY               DIFFERENTIAL ABUNDANCE
          |                                 |
 equal-depth rarefaction              preserve raw counts
   / resampling                         |
          |                      method-specific model
    alpha diversity                ALDEx2 / ANCOM-BC / ...
          |
 conventional beta
 Bray / Jaccard / UniFrac

Optional sensitivity:
coverage-based diversity
CLR → Aitchison beta
```

------------------------------------------------------------------------

## G7 --- Choose the rarefaction depth

G7 applies when equal-depth rarefaction is used for the primary
diversity workflow.

  -----------------------------------------------------------------------------------------------------------------------------
  Gate     Decision      Options →   Default            Diagnostics to      Method / test         Key pitfall   Evidence
                         when to                        compute first                                           
                         pick                                                                                   
  -------- ------------- ----------- ------------------ ------------------- --------------------- ------------- ---------------
  G7       Sampling /    Any         Recommend a        Alpha-rarefaction   Repeated subsampling  Choosing      QIIME2;
           rarefaction   candidate   dataset-specific   curves across a     across candidate      depth solely  Weiss2017;
           depth         depth       depth balancing    depth grid;         depths + descriptive  because       Schloss2024;
                         supported   **diversity        retention           stability/retention   curves "look  ChaoJost2012;
                         by retained stabilization,     overall/by group/by diagnostics           flat," solely Willis2019
                         samples     sample retention,  batch; richness                           to maximize   
                                     and group/batch    gain/slope; sample                        reads, or     
                                     balance**. No      coverage where                            from a fixed  
                                     universal 5k/10k   available;                                convention.   
                                     threshold and no   identities of                             Depth changes 
                                     mandatory fitted   samples lost at                           both          
                                     asymptote          each depth                                information   
                                                                                                  per sample    
                                                                                                  and which     
                                                                                                  subjects      
                                                                                                  remain        

  -----------------------------------------------------------------------------------------------------------------------------

### G7 decision algorithm

1.  **Build empirical rarefaction curves.** Repeatedly subsample without
    replacement over a grid of depths. At minimum compute observed
    richness and the number/fraction of eligible samples; optionally
    compute Shannon as a less rare-taxon-sensitive companion diagnostic.
    Average across resamples and retain variability.

2.  **Do not require a Michaelis--Menten asymptotic fit.** Richness
    curves may not reach a trustworthy asymptote, and fitting one can
    create false precision.

3.  **Build the retention curve.** At every candidate depth calculate
    overall retention, retention by biological group, retention by
    batch, and subjects retained under G3's dependence structure.

4.  **Assess diversity stabilization.** Quantify whether additional
    reads still materially change diversity using empirical curve
    slope/marginal richness gain, the fraction of curves stabilizing,
    Shannon stabilization, and sample coverage/completeness where
    available. A rule such as "≥90% adequately stabilized" may help
    generate an agent proposal but must be labeled an **agent
    heuristic**, not a literature-established cutoff.

5.  **Generate interpretable candidate depths.** Show at least a lower,
    recommended, and higher candidate where possible:

  ----------------------------------------------------------------------------
           Depth        Samples          Cases       Controls Curve assessment
                       retained                               
  -------------- -------------- -------------- -------------- ----------------
           3,000          24/24             12             12 several richness
                                                              curves still
                                                              rising

           5,000          23/24             11             12 most curves
                                                              stabilizing

           8,000          20/24              9             11 slightly better
                                                              stabilization,
                                                              substantial
                                                              sample loss
  ----------------------------------------------------------------------------

6.  **Recommend the lowest depth that provides adequate diversity
    information without unnecessary sample loss.** There is no universal
    requirement that 90%, 95%, or another fixed fraction of samples be
    retained. State the actual trade-off.

7.  **Re-check group, batch, and subject balance.** Before excluding any
    shallow sample, report exact sample ID, group, batch, subject,
    original depth, and why the selected depth excludes it. Escalate
    asymmetric exclusions.

8.  **Execute rarefaction transparently.** Subsample without
    replacement; use repeated resampling when the implementation
    supports aggregation; record iteration count and seeds. Repeated
    resampling reduces dependence on one arbitrary draw but does not
    eliminate information loss.

9.  **Never delete excluded samples from the project.** They are
    excluded from the rarefied diversity analysis only. They may remain
    usable for appropriate unrarefied analyses such as DA.

### Optional coverage-based sensitivity analysis

When richness is a major endpoint or equal-depth comparison is
questionable, compute Chao/Jost coverage-based diversity.

Explain it simply:

> **Equal-depth rarefaction asks:** "What diversity would we observe if
> every sample contributed the same number of reads?"
>
> **Coverage-based standardization asks:** "What diversity would we
> observe if every community were sampled to the same estimated
> completeness?"

Report whether the coverage-based analysis materially changes the
biological conclusion.

### Skeptical-reviewer challenge

Before approval, challenge the recommended depth with quantified
alternatives:

> **Reviewer proposal: 5,000 reads.** At this depth, 23/24 subjects are
> retained and most richness curves have begun to stabilize. The
> excluded sample is one case from Batch 3.
>
> **Why not 8,000?** Stabilization improves only modestly, while four
> additional subjects would be lost (3 cases, 1 control), worsening
> group and Batch-3 representation.
>
> **Why not 3,000?** All subjects are retained, but several richness
> curves are still rising appreciably.
>
> **Recommendation:** 5,000 reads for conventional alpha/beta diversity.
> Preserve all raw counts for DA. Because one case is excluded, flag
> this for sensitivity analysis.

The challenge must use actual run diagnostics, not generic prose.

### Required wet-lab-facing decision card

``` yaml
reviewer_proposal:
  diversity_method: equal_depth_rarefaction
  recommended_depth: <int>
  repeated_resampling_iterations: <int>
  samples_retained: <n>/<N>
  samples_excluded_from_diversity: [...]
  group_balance_after:
    <group>: <n>
  batch_warning: <none|description>
  curve_assessment: <plain-language description>
  raw_counts_preserved_for_DA: true
  optional_sensitivity:
    - coverage_based_diversity
    - clr_aitchison_beta
  confidence: high | moderate | low
  human_confirmation_required: true | false
```

The explanation must answer:

1.  What did we check?
2.  What did we choose?
3.  Why did we choose it?
4.  Which samples does this affect?
5.  What analysis still uses the original data?

### Hard-stop / escalation conditions

Do not silently proceed when:

-   rarefaction curves show clearly inadequate sampling across most
    samples;
-   no candidate depth provides a reasonable
    diversity-information/sample-retention trade-off;
-   proposed exclusions substantially or asymmetrically alter biological
    groups;
-   exclusions destroy within-batch group overlap;
-   paired/repeated structure would be broken in a way that invalidates
    the planned comparison;
-   a requested downstream metric is incompatible with the chosen
    transformation.

Require human resolution in these cases.

### Agent instructions

1.  Preserve immutable raw integer counts.
2.  Route standardization according to the downstream estimand; do not
    choose one global normalization merely because all analyses need
    "normalized data."
3.  Use equal-depth rarefaction/resampling as the primary conventional
    standardization for alpha and conventional beta diversity in this
    16S workflow.
4.  Preserve unrarefied counts for DA.
5.  Treat CLR/Aitchison as a coherent compositional beta pathway, not a
    generic replacement for every diversity metric.
6.  Do not present CSS as the default middle choice.
7.  Choose depth from empirical curves plus retention, group, batch, and
    subject diagnostics.
8.  Do not use a fixed 5,000/10,000-read convention.
9.  Do not require a fitted richness asymptote.
10. Explicitly list every sample excluded from rarefied diversity and
    why.
11. Re-check group/batch/subject balance after proposed exclusions.
12. Use repeated subsampling and record iterations/seeds when supported.
13. Never claim repeated rarefaction eliminates information loss.
14. Offer coverage-based diversity when completeness/richness is
    scientifically important.
15. Challenge the proposed depth with quantified lower and higher
    alternatives.
16. Explain the final proposal in plain language for a wet-lab
    scientist.
17. Log the agent recommendation and any human override.

### Required outputs

``` yaml
normalization:
  status: PASS | HUMAN_CONFIRMATION_REQUIRED | HARD_STOP

  analysis_plan:
    alpha_diversity:
      primary: equal_depth_rarefaction
      sensitivity: coverage_based_diversity | none
    beta_diversity:
      primary: rarefied_ecological_distance
      sensitivity: clr_aitchison | none
    differential_abundance:
      input: raw_unrarefied_integer_counts
      normalization: method_specific_in_step_7

  g6_diagnostics:
    depth_range: [<min>, <max>]
    depth_group_warning: <description|null>
    depth_batch_warning: <description|null>
    sparsity_summary: <description>

  rarefaction:
    selected_depth: <int>
    iterations: <int>
    replacement: false
    random_seeds: [...]
    curve_assessment: <description>

  retention:
    retained_n: <int>
    total_n: <int>
    retained_fraction: <float>
    by_group: {...}
    by_batch: {...}
    excluded_from_diversity:
      - sample_id: <id>
        depth: <int>
        group: <value>
        batch: <value|null>
        subject_id: <value|null>
        reason: <description>

  candidate_depths:
    - depth: <int>
      retained_n: <int>
      retained_by_group: {...}
      curve_assessment: <description>

  sensitivity_plan:
    coverage_based_diversity: true | false
    clr_aitchison_beta: true | false

  reviewer_challenge:
    recommended_depth: <int>
    lower_alternative: <description>
    higher_alternative: <description>

  raw_counts_preserved: true
```

## Evidence

-   **Weiss et al. 2017:** Weiss S, Xu ZZ, Peddada S, et
    al. *Normalization and microbial differential abundance strategies
    depend upon data characteristics.* Microbiome. 2017;5:27.
    doi:10.1186/s40168-017-0237-y.
-   **McMurdie & Holmes 2014:** McMurdie PJ, Holmes S. *Waste Not, Want
    Not: Why Rarefying Microbiome Data Is Inadmissible.* PLoS Comput
    Biol. 2014;10:e1003531. doi:10.1371/journal.pcbi.1003531.
-   **Gloor et al. 2017:** Gloor GB, Macklaim JM, Pawlowsky-Glahn V,
    Egozcue JJ. *Microbiome Datasets Are Compositional: And This Is Not
    Optional.* Front Microbiol. 2017;8:2224.
    doi:10.3389/fmicb.2017.02224.
-   **Willis 2019:** Willis AD. *Rarefaction, Alpha Diversity, and
    Statistics.* Front Microbiol. 2019;10:2407.
    doi:10.3389/fmicb.2019.02407.
-   **Schloss 2024:** Schloss PD. *Rarefaction is currently the best
    approach to control for uneven sequencing effort in amplicon
    sequence analyses.* mSphere. 2024. doi:10.1128/msphere.00354-23.
-   **Chao & Jost 2012:** Chao A, Jost L. *Coverage-based rarefaction
    and extrapolation: standardizing samples by completeness rather than
    size.* Ecology. 2012;93:2533--2547. doi:10.1890/11-1952.1.
-   **Chao et al. 2014:** Chao A, Gotelli NJ, Hsieh TC, et
    al. *Rarefaction and extrapolation with Hill numbers: a framework
    for sampling and estimation in species diversity studies.* Ecol
    Monogr. 2014;84:45--67. doi:10.1890/13-0133.1.
-   **Nearing et al. 2022:** Nearing JT, Douglas GM, Hayes MG, et
    al. *Microbiome differential abundance methods produce different
    results across 38 datasets.* Nat Commun. 2022;13:342.
    doi:10.1038/s41467-022-28034-z.
-   **Paulson et al. 2013:** Paulson JN, Stine OC, Bravo HC, Pop M.
    *Differential abundance analysis for microbial marker-gene surveys.*
    Nat Methods. 2013;10:1200--1202. doi:10.1038/nmeth.2658.
-   **QIIME 2:** current amplicon documentation uses alpha-rarefaction
    curves to evaluate diversity versus sampling depth and explicitly
    emphasizes examining both curve leveling and sample retention.

### Runtime citation policy

Before surfacing literature support in a gate note or final References
page, resolve the relevant source through the project's literature
retrieval system and attach the exact passage supporting the claim. This
specification defines what evidence should be verified; it is not a
substitute for run-time citation resolution.
