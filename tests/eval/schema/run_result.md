# RUN.JSON contract (proposed)

This is the structured output the agent pipeline should emit for one completed
run, so `tests/eval/runner.py` has something programmatic to check instead of
a screen to eyeball. It's the same `RUN.JSON` artifact already named in
`research/08_scientific_synthesis_literature_discovery.md` (§8I) as a
downloadable reproducibility artifact — this just makes the shape concrete.

**Status: proposed, not yet confirmed with whoever owns the reasoning
layer/backend MVP.** If the real output uses different field names, the fix
is almost always a one-line change to a `path` in
`tests/eval/manifest/crc_baxter_manifest.json`, not a rewrite of this schema
or the runner. If the real output is missing a whole *section* (e.g. no
`differential_abundance.genera` map with per-genus q-values), that's worth
raising as a gap before the eval loop starts, since several test cases
depend on it existing at all (see the "blocks" column below).

Full JSON Schema: `run_result.schema.json`. Validate any candidate output
with:

```bash
python tests/eval/runner.py --run path/to/output.json --schema-only
```

## Section-by-section

| Section | Populated by (pipeline step) | Blocks these test cases if missing/wrong-shaped |
|---|---|---|
| `meta` | Ingestion | all |
| `ingestion` | Ingestion | TC-1.* |
| `study_design` | Study Design (G1-G4) | TC-2.* |
| `raw_qc` | Raw QC (G5) | TC-3.* |
| `normalization` | Normalization/Rarefaction (G6-G7) | TC-4.* |
| `alpha_diversity` | Alpha Diversity (G8) | TC-5.* |
| `beta_diversity` | Beta Diversity (G9) | TC-6.* |
| `differential_abundance` | Differential Abundance (G10) | TC-7.* |
| `synthesis` | Scientific Synthesis | TC-8.* |
| `decision_log` | every gate | none directly checked yet, but referenced by TC-8.1 |

## The one field worth calling out specifically

`differential_abundance.genera` **must include every genus that was tested,
not only the ones that came out significant.** TC-7.4 (the negative-control
test — Faecalibacterium/Blautia/Bacteroides must *not* be claimed significant
in this single cohort) can only run if those three genera are present in the
output with their actual q-values, even though none of them clear q<0.05.
A pipeline that only serializes "hits" will silently make that test
unrunnable rather than failing it, which is worse.

## Minimal example

See `tests/eval/fixtures/run_result.gold.json` for a complete, hand-built
example tuned to pass essentially every test case in the manifest (built
from the real recomputed numbers in `research/fixtures/baxter_genus_kw_results.csv`),
and `run_result.bad_example.json` for one that deliberately reproduces three
of the specific failure modes research/09 was written to catch, to prove the
runner actually distinguishes pass from fail before pointing it at a real
pipeline.
