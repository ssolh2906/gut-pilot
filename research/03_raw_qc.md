## Step 3 — Raw QC

```yaml
step_id: raw_qc
page_key: qc
gate_ids: [G5]
inputs: [working_count_table, group_assignment, batch_handling, dependence_structure, parse_report]
outputs: [depth_qc_status, candidate_low_depth_samples, depth_diagnostics, sanity_checklist, gate_note]
```

### Scientific purpose

Inspect sequencing depth and inherited data-integrity checks **before normalization or sample exclusion**.

This step is deliberately descriptive. It identifies samples whose sequencing depth may be too low for reliable downstream ecological analysis and checks whether low depth is systematically associated with biological group, batch, or subject structure.

**G5 is a QC flagging gate, not the final rarefaction/exclusion gate.** No sample is removed here. Final inclusion/exclusion decisions are made in Step 4 using the observed rarefaction curves and the selected normalization strategy.

A fixed read threshold should not be presented as a universal biological quality standard. Sequencing depth requirements depend on the community, assay, and downstream estimand. Weiss et al. (2017) found particularly problematic behavior at very low library sizes (approximately <1,000 reads/sample) in their evaluated settings, but did not establish 5,000 reads as a universal QC cutoff.

### Decision table

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| G5 | Low-depth screening / QC flag | (a) no low-depth flag; (b) flag samples below an evidence-informed warning threshold; (c) flag statistical depth outliers; (d) flag both | **Do not exclude samples at a fixed threshold.** Use <1,000 reads as an evidence-informed severe-low-depth warning for 16S amplicon data, while also identifying dataset-relative depth outliers. Carry all flagged samples to Step 4 for rarefaction-curve evaluation | Per-sample library depth; min, max, median, IQR and quantiles; sorted depth plot; log-depth distribution; candidate outliers; group-wise and batch-wise depth distributions | Descriptive thresholding + robust outlier diagnostics; no significance test determines sample quality | Treating 1,000, 5,000, or 10,000 reads as a universal pass/fail threshold. Adequate depth depends on the community and downstream analysis; final exclusion should be justified by Step 4 rarefaction behavior | Weiss2017; Willis2019 |
| — | Depth imbalance by biological group | Flag vs clean | Always evaluate after G1 is fixed | Group-wise depth summaries and distributions; depth ratios/differences; visualize log library size by group | Descriptive effect size and visualization; optional inferential test only as supporting evidence | If one biological group is systematically shallower, subsequent depth filtering or rarefaction can selectively remove that group and induce selection bias | Weiss2017 |
| — | Depth imbalance by batch | Flag vs clean | Always evaluate for every batch variable retained from G2 | Batch-wise depth summaries; group × batch × depth view; identify batches containing disproportionate numbers of low-depth samples | Descriptive effect size and visualization | A low-depth tail confined to one sequencing batch is evidence of a technical problem, not merely a collection of unrelated bad samples | Weiss2017 |
| — | Inherited sanity checklist | PASS vs unresolved issue | Re-check Step 1/2 state; hard-stop only if an upstream blocking issue somehow remains unresolved | Parse-report status; sample-ID uniqueness; metadata reconciliation; G1 confirmation; G2 identifiability; G3 dependence structure; G4 aggregation integrity | State/schema validation | Quietly repairing an upstream failure at QC destroys the audit trail. Return unresolved scientific/design failures to the gate where they originated | — |

### G5 — Depth QC algorithm

For every sample, compute total library depth from the **pre-normalization working count table**.

Then:

1. Report the full depth distribution:
   - minimum;
   - 5th percentile;
   - 25th percentile;
   - median;
   - 75th percentile;
   - 95th percentile;
   - maximum;
   - max/min ratio where meaningful.

2. Plot or return data for:
   - sorted per-sample library depth;
   - log10 library-depth distribution;
   - library depth by biological group;
   - library depth by each relevant technical batch.

3. Flag samples with **<1,000 reads** as `SEVERE_LOW_DEPTH` for conventional 16S amplicon analysis. This is a warning threshold motivated by Weiss et al. (2017), not an automatic exclusion rule.

4. Also identify dataset-relative extreme low-depth samples using a robust diagnostic (for example, unusually low log-depth relative to the cohort). Label these `RELATIVE_LOW_DEPTH_OUTLIER`.

5. Do not automatically label every sample below 5,000 or 10,000 reads as poor quality. These values may be displayed as optional visual reference lines if useful, but they are not universal evidence-based pass/fail criteria.

6. For every flagged sample, report:
   - sample ID;
   - depth;
   - biological group;
   - batch(es);
   - subject ID if available;
   - flag reason.

7. Quantify whether flagged samples disproportionately belong to one biological group or batch.

8. **Do not remove any sample.** Carry flagged samples and all depth diagnostics into Step 4, where rarefaction curves can determine whether their observed community diversity is adequately sampled at a defensible common depth.

### Why this is separate from rarefaction depth

Two different questions must remain separate:

**Step 3 asks:**
> Does any sample have suspiciously little sequencing information, and is low sequencing depth structured by group or batch?

**Step 4 asks:**
> Given the observed richness-vs-depth behavior and chosen normalization strategy, what sequencing depth is sufficient for the intended diversity analysis, and which samples cannot support that depth?

A sample can therefore be flagged in Step 3 but retained after Step 4 if its rarefaction behavior is adequate. Conversely, a sample above an arbitrary 5,000-read threshold can still fail to support the selected rarefaction depth.

This separation prevents a conventional threshold from silently determining cohort membership.

### Group/batch imbalance check

Low sequencing depth becomes particularly dangerous when it is not randomly distributed.

For every candidate low-depth definition, report:

```text
                    Flagged     Not flagged
Cases                  4            16
Controls               0            20
```

and the corresponding breakdown by batch.

The agent should explicitly flag patterns such as:

> Four low-depth samples are all cases and all originate from sequencing Batch 3. Excluding these samples could alter both group balance and batch composition. No samples are removed at G5; this pattern must be considered when selecting the Step 4 normalization strategy and rarefaction depth.

Do not use a non-significant p-value as evidence that depth imbalance is harmless, particularly in small datasets. Show the counts and magnitude of the imbalance directly.

### Sanity checklist

Before marking Raw QC complete, confirm:

- Step 1 ingestion status is `PASS`;
- counts remain raw non-negative integers before normalization;
- sample identifiers remain unique;
- metadata reconciliation remains intact;
- G1 group definition has been confirmed;
- G2 has not marked the biological comparison `NON_IDENTIFIABLE`;
- G3 subject/dependence structure is available;
- G4 taxonomic aggregation, if performed, conserved total counts exactly;
- no samples have yet been silently removed;
- every candidate low-depth sample is explicitly listed.

If an upstream hard-stop condition is discovered, return it to the relevant earlier gate rather than repairing it silently here.

### Agent instructions

Your role in this step is **QC diagnosis, not sample exclusion**.

1. Compute sequencing depth for every sample before normalization.
2. Describe the entire depth distribution rather than reducing QC to one threshold.
3. Treat <1,000 reads as an evidence-informed severe-low-depth warning for conventional 16S amplicon data, not as a universal exclusion threshold.
4. Identify additional extreme low-depth samples relative to this dataset.
5. Always inspect depth by biological group and technical batch.
6. For every flagged sample, report its group, batch, subject, depth, and exact flag reason.
7. Explicitly warn when low-depth samples cluster within one group or batch.
8. Do not remove samples in this step.
9. Do not choose the rarefaction depth in this step.
10. Do not normalize counts in this step.
11. Carry all flagged samples and diagnostics into Step 4.
12. Preserve the audit trail: never silently repair or discard an upstream issue.

### Required outputs

```yaml
raw_qc:
  status: PASS | PASS_WITH_FLAGS | RETURN_TO_UPSTREAM_GATE

  depth_summary:
    n_samples: <int>
    min: <int>
    p05: <float>
    p25: <float>
    median: <float>
    p75: <float>
    p95: <float>
    max: <int>
    max_min_ratio: <float|null>

  candidate_low_depth_samples:
    - sample_id: <id>
      depth: <int>
      group: <value>
      batch: <value|null>
      subject_id: <value|null>
      flags: [SEVERE_LOW_DEPTH, RELATIVE_LOW_DEPTH_OUTLIER]

  group_depth_diagnostics:
    <group>:
      n: <int>
      median_depth: <float>
      depth_range: [<min>, <max>]
      n_flagged: <int>

  batch_depth_diagnostics:
    <batch_variable>:
      <batch_level>:
        n: <int>
        median_depth: <float>
        n_flagged: <int>

  imbalance_flags:
    - <description>

  samples_excluded: []

  sanity_checklist:
    ingestion_pass: true | false
    metadata_reconciled: true | false
    group_confirmed: true | false
    design_identifiable: true | false
    dependence_structure_available: true | false
    taxonomy_count_conservation_pass: true | false
    silent_sample_removal_detected: true | false
```

### Evidence

- **Weiss et al. 2017 — library-size effects:** Weiss S, Xu ZZ, Peddada S, et al. *Normalization and microbial differential abundance strategies depend upon data characteristics.* Microbiome. 2017;5:27. doi:10.1186/s40168-017-0237-y. The study emphasizes that library-size heterogeneity can distort microbiome analyses and reports particularly problematic behavior for very low library sizes (approximately <1,000 sequences/sample) in the evaluated settings. It does **not** establish 5,000 reads as a universal QC threshold.
- **Weiss et al. 2017 — depth versus inclusion trade-off:** rarefaction depth creates a trade-off between sequencing depth and sample retention; rarefaction curves can guide an informative depth choice. This supports flagging low-depth samples here while deferring final exclusion to Step 4.
- **Willis 2019:** Willis AD. *Rarefaction, Alpha Diversity, and Statistics.* Front Microbiol. 2019;10:2407. doi:10.3389/fmicb.2019.02407. Diversity estimation depends on sampling intensity and requires explicit consideration of statistical uncertainty and unobserved diversity.

### Runtime citation policy

Before surfacing literature support in a gate note or final References page, resolve the relevant source through the project's literature retrieval system and attach the exact passage supporting the claim. Methodological citations in this specification define what should be verified; they are not a substitute for run-time source resolution.
