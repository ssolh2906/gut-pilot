## Step 2 — Study Design

```yaml
step_id: study_design
page_key: design
gate_ids: [G1, G2, G3, G4]
inputs: [validated_count_table, parsed_taxonomy, validated_metadata]
outputs: [group_assignment, batch_handling, dependence_structure, working_rank, working_count_table, gate_notes]
```

### Scientific purpose

Define the comparison being made and the structure of the observations **before looking for biological differences between groups**.

This step determines four design choices that propagate through the rest of the analysis:

1. which metadata variable defines the biological comparison;
2. whether technical batches are associated with that comparison and how they should be handled;
3. which samples are statistically independent and therefore what the unit of inference is; and
4. at what taxonomic resolution the feature table should be analyzed.

These are scientific design decisions, not preprocessing conveniences. When the metadata do not identify the intended comparison unambiguously, require human confirmation rather than inferring study labels from sample names.

### Decision table

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G1 | Group / outcome definition | (a) explicit metadata group/outcome variable; (b) agent-proposed candidate metadata variable requiring human confirmation; (c) manual assignment; (d) single-cohort/no between-group comparison | Use an explicitly identified metadata variable when available. Otherwise rank plausible metadata columns and **require human confirmation before analysis**. Never infer biological groups from sample-ID prefixes alone | Classify metadata columns as identifier, categorical, binary, ordinal, continuous, time, technical/batch, or likely outcome/exposure; summarize unique values and missingness; flag candidate comparison variables | Metadata/schema reasoning + human confirmation | Choosing the wrong metadata field changes the scientific question. Sample IDs may encode site, batch, subject, or timepoint and are not evidence of biological group membership | — |
| G2 | Batch/confounding assessment and handling | (a) no adjustment if batch is not meaningfully associated with group; (b) adjust/model batch; (c) restrict/stratify permutations where appropriate; (d) propose sensitivity analysis excluding a suspicious batch; (e) hard-stop when group and batch are effectively inseparable | Test every plausible technical variable against group. If association is present, retain all data initially and adjust/model when identifiable; identify which batch levels drive the association and propose exclusion only as a transparent sensitivity analysis, not an automatic fix | For each technical variable: group × batch contingency table; per-level group proportions and sample counts; standardized residuals from the contingency table; Cramér's V; library-depth distribution by batch/group; identify sparse cells and empty group × batch combinations | Fisher's exact or chi-square as appropriate; Cramér's V; standardized residuals; design-matrix/overlap check | Removing the batch most correlated with outcome can manufacture balance by deleting inconvenient observations. Perfect or near-perfect group–batch confounding may make the biological effect non-identifiable and cannot be repaired statistically | Yan2025; Wirbel2024 |
| G3 | Unit of inference / sample dependence | Independent subjects vs paired/repeated samples vs more general clustering within subject | **Subject is the default unit of inference whenever a subject identifier is available.** If each subject contributes one sample, this reduces to ordinary independent-sample analysis. If subjects contribute multiple samples, downstream p-values/permutations must account for within-subject clustering or pairing | Identify subject/patient/person ID columns; count samples per subject; inspect timepoint/visit/pair variables; cross-tabulate subject × group and subject × timepoint; identify whether comparison is paired, longitudinal, or clustered | Structural design check; downstream methods must use subject-aware blocking/clustering/mixed models as supported | Treating repeated samples from the same person as independent creates pseudoreplication and artificially small p-values. Conversely, blindly using a paired test is wrong when repeated observations do not form complete matched pairs | — |
| G4 | Taxonomic analysis rank | Phylum / family / genus / species / ASV-or-OTU; only ranks actually supported by the supplied taxonomy may be selected | For conventional short-read 16S data, propose **genus** as the primary interpretable analysis when genus assignments are sufficiently complete and credible; require the user to see the resolution trade-off and allow override. Do not claim genus is universally optimal | At each available rank compute: number of resulting features after collapsing; fraction of total reads assigned to a named taxon at that rank; fraction of original features unresolved at that rank; prevalence/sparsity distribution; number of lower-level features merged into each higher-level feature | Collapse raw integer counts by **summing** all features sharing the same taxonomic assignment through the selected rank; report information loss | Coarse ranks can hide opposing lower-level effects, while very fine ranks increase sparsity/multiple testing and may exceed the taxonomic resolution supported by short 16S amplicons. An ASV/OTU is a sequence feature, not automatically a biological species | QIIME2; Yarza/16S-resolution evidence |

### G1 — Group definition algorithm

The agent must determine the intended scientific comparison from metadata, not from sample naming conventions.

1. Inspect all metadata columns and classify their likely role.
2. Prefer columns explicitly named or clearly documented as biological outcomes/exposures/groups (for example `disease`, `diagnosis`, `case_control`, `phenotype`, `treatment`, `group`).
3. Exclude obvious identifiers and technical variables such as `sample_id`, sequencing run, plate, extraction batch, lane, or file name from candidate biological grouping variables.
4. If exactly one plausible biological comparison is clearly documented, propose it and show the group counts.
5. If the intended comparison is not explicit, rank the most plausible candidate variables and explain briefly why each could represent the outcome/exposure.
6. **Require human confirmation before committing G1 whenever the comparison was inferred rather than explicitly specified.**
7. Never infer disease/control status from sample-ID prefixes alone. Sample-ID structure may be shown as supporting metadata diagnostics but cannot establish the scientific grouping.
8. After confirmation, freeze the selected comparison variable in the run state so later agents cannot silently redefine the groups.

### G2 — Batch/confounding algorithm

Search metadata for plausible technical variables including sequencing run, plate, extraction batch, processing date, center/site, lane, instrument, laboratory, study/cohort, and other variables explicitly marked as technical.

For each plausible batch variable:

1. Cross-tabulate batch × group.
2. Report sample counts and group proportions within every batch level.
3. Quantify overall association using Cramér's V and an appropriate contingency-table test.
4. Compute standardized cell residuals or equivalent diagnostics to identify **which batch levels and group combinations drive the association**, rather than reporting only one global p-value.
5. Flag empty or nearly empty group × batch cells because they indicate poor overlap.
6. Examine library depth and other immediately available technical QC measures by batch and group.
7. Classify the result:
   - **CLEAN:** no material evidence that batch tracks group.
   - **ADJUST:** batch is associated with group but sufficient within-batch overlap remains to estimate the biological contrast.
   - **SENSITIVITY REQUIRED:** one or more batches disproportionately drive the association or result; retain them in the primary analysis when scientifically valid, but propose a clearly labeled leave-one-batch-out or suspicious-batch-excluded sensitivity analysis.
   - **NON-IDENTIFIABLE / HARD STOP:** group and batch are perfectly or near-perfectly confounded such that the biological contrast cannot be separated from the technical contrast.

Do **not** automatically remove a batch because it is correlated with the outcome. Removal changes the target population and can itself bias the result. If exclusion is proposed, name the exact batch, quantify why it was flagged, show how many samples from each biological group would be removed, and require human approval.

### G3 — Dependence and unit-of-inference algorithm

The agent must distinguish **samples** from **independent experimental units**.

1. Search metadata for subject/person/patient/donor identifiers.
2. Count observations per subject.
3. If every subject contributes exactly one sample, mark the design as subject-independent.
4. If subjects contribute repeated observations:
   - determine whether observations are paired across conditions;
   - determine whether they are longitudinal/time-indexed;
   - determine whether some subjects contribute unequal numbers of samples.
5. Set `subject_id` as the clustering/blocking variable whenever available.
6. Propagate the dependence structure to downstream agents. Downstream inference must use a method that respects the design (for example paired tests for true matched pairs, subject-restricted permutations where valid, or clustered/mixed-effects approaches for more general repeated measures).
7. Never recover a subject identifier from sample-ID prefixes unless the mapping is explicit or human-confirmed.

The gate note must always state the inferred unit of inference, even for a simple cross-sectional dataset.

### G4 — Taxonomic rank: what the choice means

The count table begins with sequence-level features (OTUs or ASVs) that have taxonomic annotations. Several distinct sequence features can be assigned to the same genus, several genera belong to the same family, and so forth.

Selecting a taxonomic rank means **collapsing features that share the same taxonomy at that level and summing their raw counts**.

Conceptually:

```text
ASV_1 ─┐
ASV_2 ─┼─> Genus A ─┐
ASV_3 ─┘             │
                     ├─> Family X
ASV_4 ───> Genus B ──┘
```

At genus level, counts for ASV_1–3 are summed into `Genus A`. At family level, `Genus A` and `Genus B` are themselves merged into `Family X`.

This creates a bias–variance / resolution–power trade-off:

- **Phylum:** very coarse. Few features and comparatively little multiple-testing/sparsity burden, but biologically distinct organisms are heavily merged and opposing signals can cancel.
- **Family:** intermediate but still relatively coarse.
- **Genus:** often a useful primary compromise for short-read 16S studies: more biologically interpretable than family/phylum while avoiding many unsupported species-level claims.
- **Species:** biologically attractive when assignments are reliable, but short 16S amplicons frequently cannot uniquely resolve closely related species. Only offer this as a primary rank when the sequencing/taxonomy pipeline supports credible species-level classification.
- **ASV/OTU:** preserves the finest measured sequence resolution and avoids taxonomy-collapse information loss, but creates many sparse features and a larger multiple-testing burden. ASVs/OTUs should not be described as equivalent to species.

The agent should therefore **show the empirical consequence of each available rank before recommending one**. For example:

```text
Rank       Features   Reads assigned to named rank   Median prevalence
Phylum          12             99%                        91%
Family          71             95%                        24%
Genus          184             88%                        11%
Species        412             46%                         3%
ASV/OTU       3,842           100%                         1%
```

The recommendation should depend on both the assay and these diagnostics. For ordinary short-read 16S data with reasonable genus annotation, genus is the default proposal. If genus assignment itself is poor, the agent should consider family; if high-quality full-length 16S or another assay provides credible species resolution, species can become defensible. Generally Genus should be the preferred default but strong evidence can lead to the agent suggesting another rank. 

Taxonomic collapsing must always be performed by summing the **raw integer counts** of child features. Never average or re-normalize relative abundances during the collapse.

### Agent instructions

Your role is to establish the study's inferential design before downstream analysis.

1. Determine the biological comparison from metadata. Never infer biological groups solely from sample IDs.
2. If the intended group/outcome variable is ambiguous, propose the most plausible metadata variables and require human confirmation.
3. After G1 is confirmed, evaluate every plausible technical/batch variable for association with the chosen group.
4. When batch confounding is detected, identify the specific batch levels driving it and quantify the overlap problem.
5. Never automatically remove a suspicious batch. Propose adjustment, restricted inference, sensitivity analysis, or a hard stop depending on identifiability.
6. Treat the subject/person as the independent unit whenever a subject identifier exists. Propagate clustering/pairing information to every downstream inferential step.
7. Never count repeated samples from one subject as independent evidence.
8. Evaluate taxonomic resolution empirically before recommending a rank.
9. For conventional short-read 16S data, genus is a reasonable default proposal, not a universal truth.
10. Collapse taxonomy only after G4 is resolved and only by summing raw integer counts.
11. Produce a gate note for every G1–G4 decision containing diagnostics, recommendation, confidence, caveats, and whether human confirmation was required.
12. Hard-stop when the scientific comparison is unresolved or when group and technical batch are not statistically identifiable.

### Required outputs

```yaml
study_design:
  group_assignment:
    variable: <metadata column>
    levels: [...]
    counts: {...}
    source: explicit_metadata | agent_proposed_human_confirmed | manual
    human_confirmation_required: true | false

  batch_handling:
    variables_checked: [...]
    selected_batch_variables: [...]
    status: CLEAN | ADJUST | SENSITIVITY_REQUIRED | NON_IDENTIFIABLE
    diagnostics:
      - variable: <name>
        association_test: <test>
        p_value: <value|null>
        cramers_v: <value|null>
        driving_levels: [...]
        empty_or_sparse_cells: [...]
    proposed_primary_handling: <description>
    proposed_sensitivity_analyses: [...]

  dependence_structure:
    subject_id_variable: <name|null>
    n_subjects: <int>
    n_samples: <int>
    repeated_subjects: <int>
    design: independent | paired | longitudinal | clustered
    downstream_inference_requirement: <description>

  taxonomy:
    selected_rank: <rank>
    rationale: <description>
    rank_diagnostics:
      - rank: <rank>
        n_features: <int>
        fraction_reads_named: <float>
        fraction_features_unresolved: <float>
        median_prevalence: <float>
    aggregation: sum_raw_integer_counts

  status: PASS | HUMAN_CONFIRMATION_REQUIRED | HARD_STOP
```

### Evidence

- **Taxonomic collapsing:** QIIME 2 defines taxonomic collapse as grouping features with the same taxonomic assignment through a selected level and summing their frequencies. This supports performing G4 on raw counts rather than averaging or re-normalizing child features.
- **16S taxonomic resolution:** short 16S amplicons contain limited sequence information. Species-level classification is frequently unreliable, and even some closely related organisms cannot be distinguished at genus level using partial 16S sequences. The defensible rank therefore depends on the sequenced region, classifier/reference database, and observed assignment quality.
- **Batch/confounder robustness:** microbiome association analyses are vulnerable to technical and cohort confounding. Batch variables must be assessed against the biological comparison rather than assumed harmless, and non-identifiable designs must be distinguished from confounding that can reasonably be adjusted.
- **Repeated observations:** downstream inference must respect the experimental unit. Repeated observations from one subject do not provide the same independent evidence as observations from different subjects.

### Runtime citation policy

Before surfacing literature support in a gate note or final References page, resolve the relevant source through the project's literature retrieval system and attach the exact passage supporting the claim. Methodological citations in this specification define what should be verified; they are not a substitute for run-time source resolution.
