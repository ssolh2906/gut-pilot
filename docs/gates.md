# Gates — index

A **gate** is a point where the run cannot proceed on the agent's judgement alone. The agent
proposes, the reviewer disposes, and the decision is recorded. Everything else on a page is a
panel: it renders, it does not decide.

---

## The ten gates

**Pri** is implementation order. **Evidence** is how the gate's thresholds and copy are sourced:
`Table` means a curated T-table ships, `Prompt` means the default Paperclip prompt carries it for now.

| ID | Gate | Page | Decides | Pri | Evidence | Detail |
|---|---|---|---|---|---|---|
| G1 | Group definition | Design | What is being compared. Turns every group test on or off. | P3 | Prompt | [G1.md](gates/G1.md) |
| G2 | Batch confounding | Design | Whether a processing effect can be separated from the disease effect. | P2 | Table ✅ | [G2.md](gates/G2.md) |
| G3 | Sample independence | Design | The test family. Wrong here invalidates every p-value on the run. | P2 | Prompt | [G3.md](gates/G3.md) |
| G4 | Taxonomic rank | Design | Feature count, and whether a marker can be named at all. | P3 | Prompt | [G4.md](gates/G4.md) |
| G5 | QC depth floor | Raw QC | Which samples are *flagged* as under-sequenced. Flags only, never excludes. | P2 | Table | [G5.md](gates/G5.md) |
| **G6** | Normalization strategy | Normalize | How uneven depth is handled. Constrains G7 and G9. | **P1** | **Table** 🔬 | [G6.md](gates/G6.md) |
| **G7** | Rarefaction depth | Normalize | Which samples are *excluded*. Active only under G6 = Rarefaction. | **P1** | **Table** 🔬 | [G7.md](gates/G7.md) |
| G8 | Significance settings | Alpha | Every p and q on Alpha, Beta and Differential. | P2 | Prompt | [G8.md](gates/G8.md) |
| **G9** | Distance metric | Beta | What "different" means between two samples. | **P1** | **Table** 🔬 | [G9.md](gates/G9.md) |
| G10 | Prevalence filter | Differential | How many features are tested, and therefore correction stringency. | P2 | Prompt | [G10.md](gates/G10.md) |

✅ built · 🔬 human researcher in progress

**G6, G7, G9 are P1**: the three gates where the literature genuinely disagrees, so a prompt can't settle it — they need curated tables. A researcher is compiling them; the default prompt stands in until they land.

Prompt-mode retrieval goes through Paperclip (`.claude/skills/paperclip`), one prompt parameterised by gate. Its output is the interim shape of a T-table row; when a table lands, the prompt retires for that gate.

Non-deciding panels, per page: Upload (drop zone, schema contract, prompt chips) · Raw QC (depth chart, sanity checklist) · Normalize (rarefaction curves, retention, debate) · Alpha (composition, sample detail) · Beta (PCoA, PERMANOVA strip, distance matrix) · Differential (volcano, known-taxa, artifact warnings) · Summary (sources, decision log, reproducibility).

---

## Cross-gate rules

No gate is independent. These interlocks are the product; without them this is a settings panel.
Each rule is specified in full in the gate file listed under *Owner*.

| Rule | Condition | Response | Owner |
|---|---|---|---|
| R1 | G5 floor above G7 depth **and** samples fall in the gap | Warn, name the samples, offer both fixes | G5 |
| R2 | G6 = CLR and G9 = Bray-Curtis | Warn: metric does not match the transform | G6 |
| R3 | G6 ≠ Rarefaction | Disable G7 and say why | G6 |
| R4 | G1 = single-cohort | Disable every group comparison, with a reason on each affected panel | G1 |
| R5 | G2 shows strong confounding and the reviewer proceeds anyway | Caveat on every PERMANOVA result and on Summary | G2 |
| R6 | G10 changed after results were viewed | Flag the forking-paths risk | G10 |
| R7 | G3 = paired but the data cannot support paired tests | **Block**, do not warn | G3 |

**R1 is not "the two numbers differ."** It fires only when a sample is flagged by G5 *and* survives G7. Warning whenever the numbers merely differ makes the default state cry wolf.

## Invalidation

Which gate kills which cached result — the source for `gates.json`; client store and server recompute logic both read it rather than each keeping their own copy.

| Gate | Invalidates | Cost |
|---|---|---|
| G1 | everything | full |
| G2 | beta.permanova, summary.caveats | cheap |
| G3 | alpha.tests, beta.permanova, da.* | medium |
| G4 | composition, da.*, known_taxa, feature_count → G8 | medium |
| G5 | qc.flags, checklist, warnings.P1 | cheap |
| G6 | retention → alpha.*, beta.*, da.*; forces G9 | full |
| G7 | retention → alpha.*, beta.*, da.* | full |
| G8 | alpha.tests, beta.permanova, da.volcano, da.known_taxa | cheap |
| G9 | beta.pcoa, beta.matrix, beta.permanova | medium |
| G10 | da.*, known_taxa, warnings.P4, and G8's tested-feature count | cheap |

## Gate file template

Every `G*.md` uses the same nine sections, in order:

```
1. Anchor · 2. Layer · 3. Endpoint · 4. Request (incl. upstream gates) · 5. Response (every number, named)
6. Invalidation · 7. Evidence (T-table) · 8. States · 9. Decision log
```

Layer discipline, the whole trust argument: **Compute** produces numbers, never a sentence. **Reasoning** (Claude) selects and explains, never a number Compute didn't hand it. **Evidence** supplies thresholds, citations and message templates from versioned tables (T-series).

## Open questions

Paperclip interface (CLI vs MCP) is unconfirmed — decides how the Evidence layer is called. G6/G7/G9 tables are with the researcher; until they land those gates run on the default prompt, so their thresholds aren't reproducible between runs.
