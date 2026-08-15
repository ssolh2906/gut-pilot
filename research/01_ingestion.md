## Step 1 — Upload & Ingestion

```yaml
step_id: ingestion
page_key: upload
gate_ids: []
inputs: [raw_count_table, optional_metadata_tsv, optional_taxonomy_file]
outputs: [validated_count_table, parsed_taxonomy, validated_metadata, parse_report]
```

### Scientific purpose

Establish a trustworthy representation of the uploaded data before any scientific choices, filtering, normalization, or statistical analysis occur.

This step is a **data-contract and provenance check, not a scientific decision gate**. Preserve the uploaded counts and feature identities as faithfully as possible. Do not collapse taxa, normalize counts, exclude low-depth samples, infer biological groups, or otherwise modify the biological data beyond explicitly logged parsing operations.

The output `validated_count_table` must remain a raw, non-negative integer feature-count table. Taxonomic aggregation is deferred to Study Design (G4).

### Decision table

| Gate | Decision | Options → when to pick | Default | Diagnostics to compute first | Method / test | Key pitfall | Evidence |
|---|---|---|---|---|---|---|---|
| — | Delimiter detection | CSV vs TSV; infer from file structure | Auto-detect; hard-stop if ambiguous | Parse candidate delimiters while respecting quoted fields; compare resulting column consistency across multiple rows | Structured delimiter sniffing | Counting commas only in the header can fail when lineage strings contain commas or quoted delimiters | — |
| — | Table orientation | Features × samples vs samples × features | Infer from taxonomy/feature-ID structure and numeric dimensions; hard-stop if ambiguous | Inspect first row and column for feature/taxonomy identifiers; calculate fraction numeric along each candidate sample axis | Schema/orientation inference | A transposed table can remain syntactically valid and propagate far downstream while assigning biological meaning to the wrong axis | — |
| — | Feature/taxonomy parsing | Full lineage (`k__…;g__…`), bare taxon label, feature/OTU/ASV ID with embedded lineage, or feature ID with separate taxonomy file | Preserve the original feature ID and separately parse recognized taxonomy ranks; do **not** collapse to genus here | Detect recognized rank prefixes (`k__`, `p__`, `c__`, `o__`, `f__`, `g__`, `s__`) and delimiters; detect whether taxonomy is embedded or separately supplied | String/schema parsing | MicrobiomeHD-style tables append `d__denovoN` identifiers after the taxonomic lineage. These identify OTUs and must not be interpreted as species/strain taxonomy | MicrobiomeHD |
| — | Trailing `total` column | Validate and remove vs hard-stop | Validate against row-wise sum of sample counts, then remove from the working table while recording the operation | Compute row-wise sample sums and compare with declared `total` | Exact arithmetic reconciliation | A non-reconciling total suggests truncation, column misidentification, orientation error, or parsing failure. Do not silently ignore it | — |
| — | Count validity | Accept vs reject | Require finite, non-negative integer raw counts; hard-stop otherwise | Check for missing/NaN/Inf values, negative values, non-numeric entries, and non-integer values across every count cell | Full-table type/value validation | Silently rounding floats can convert relative abundance or another normalized representation into apparently valid counts. Never repair this automatically | QIIME2 |
| — | Identifier uniqueness | Unique sample IDs required; repeated taxonomy labels permitted if feature IDs remain uniquely traceable | Hard-stop duplicate sample IDs. Preserve distinct feature IDs even when multiple features share the same taxonomic assignment | Check sample-ID uniqueness; check feature-ID uniqueness; separately count repeated taxonomy labels | Uniqueness/schema check | Multiple OTUs/ASVs can legitimately map to the same genus or other taxon. Treating repeated taxonomy labels as duplicate observations can destroy valid biological features before G4 aggregation | MicrobiomeHD; QIIME2 |
| — | Metadata reconciliation | Metadata present vs absent | If present, reconcile sample identifiers **before joining**. If absent, continue and defer group definition to G1 | Trim surrounding whitespace in a logged normalization step; compare sample-ID sets; report exact symmetric difference and potential case-only mismatches | Set reconciliation | An inner join can silently discard unmatched samples and produce an apparently clean but altered cohort. Do not join until unresolved mismatches have been surfaced | MicrobiomeHD |
| — | Metadata join | Join after reconciliation vs hard-stop | Join only after identifiers reconcile or an explicit resolution has been recorded | Confirm uniqueness of metadata sample IDs and successful 1:1 mapping to count-table samples | Validated keyed join | Automatically lowercasing, fuzzy-matching, or otherwise rewriting IDs may merge genuinely distinct samples. Suggest probable matches but never silently apply them | — |

### Hard-stop conditions

Do **not** advance to Study Design if any of the following remain unresolved:

- table orientation is ambiguous;
- count values contain missing, infinite, negative, or non-integer values;
- duplicate sample identifiers exist;
- feature identifiers cannot be kept uniquely traceable;
- a declared `total` column does not reconcile with sample counts;
- metadata contains duplicate sample identifiers;
- count-table and metadata sample identifiers do not reconcile when metadata is required for the run.

A hard stop should identify the exact offending rows, columns, values, or sample IDs and suggest the smallest corrective action. Never silently repair a scientifically meaningful ambiguity.

### Agent instructions

Your role in this step is **validation, not scientific interpretation**.

1. Preserve the raw feature-count matrix and original feature identifiers.
2. Determine the table's structure and orientation before interpreting any values.
3. Parse taxonomy into a separate structured representation while retaining the original feature-to-taxonomy mapping.
4. Do not collapse features to genus or any other taxonomic rank. Taxonomic aggregation is a scientific decision made later at G4.
5. Verify that every count is a finite, non-negative integer. Raw counts and relative-frequency tables are different data types and must not be silently converted between one another.
6. Reconcile metadata identifiers explicitly before joining. Report every unmatched identifier from either side.
7. Never silently drop samples, features, rows, or columns except recognized non-biological bookkeeping fields such as a validated `total` column.
8. Record every parsing transformation in `parse_report`.
9. If an ambiguity could alter which biological observations enter the analysis, stop and request resolution rather than guessing.
10. Do not perform biological QC, depth filtering, normalization, group inference, taxonomic aggregation, or statistical testing in this step.

### Required parse report

Return a structured report containing at minimum:

```yaml
parse_report:
  status: PASS | HARD_STOP
  table_orientation: features_by_samples | samples_by_features
  n_samples: <int>
  n_features: <int>
  count_type: raw_integer_counts
  count_range: [<min>, <max>]
  library_depth_range: [<min>, <max>]

  taxonomy:
    detected: true | false
    format: <description>
    deepest_rank_observed: <rank>
    n_unique_feature_ids: <int>
    n_repeated_taxonomy_labels: <int>

  metadata:
    supplied: true | false
    n_rows: <int|null>
    matched_samples: <int|null>
    unmatched_count_table_ids: [...]
    unmatched_metadata_ids: [...]
    probable_formatting_mismatches: [...]

  transformations:
    - <exact logged transformation>

  warnings:
    - <non-blocking issue>

  hard_stops:
    - <blocking issue>
```

The report should also provide a short human-readable summary, for example:

> **PASS — ingestion validated.** 24 samples × 8,431 features were parsed as raw integer counts. All 24 samples reconcile with metadata. Taxonomy was recognized as an RDP-style lineage with denovo OTU identifiers preserved separately. The declared `total` column exactly matched row-wise counts and was removed. No biological filtering, normalization, or taxonomic aggregation was performed.

### Evidence

- **QIIME 2 `FeatureTable[Frequency]`:** raw feature-count tables contain whole-number, non-negative feature frequencies and are semantically distinct from relative-frequency tables. The input data type must therefore be established before downstream analysis.
- **MicrobiomeHD:** datasets provide OTU tables and associated metadata; metadata and sequencing sample sets may not correspond perfectly. MicrobiomeHD OTU labels ending in `d__denovoID` link OTUs to their representative sequences rather than representing an additional biological taxonomic rank.
- **Taxonomic collapsing:** collapsing features to a selected taxonomic level combines features sharing that assignment by summing their frequencies. This supports preserving feature-level counts and taxonomy separately during ingestion and deferring aggregation until the analysis rank has been selected at G4.
