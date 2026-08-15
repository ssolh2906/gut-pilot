# Gates — index

A **gate** is a point where the run cannot proceed on the agent's judgement alone. The agent
proposes, the reviewer disposes, and the decision is recorded. Everything else on a page is a
panel: it renders, it does not decide.

---

## The ten gates

**Pri** is implementation order. **Evidence** is how the gate's thresholds and copy are sourced
within the hackathon: `Table` means a curated T-table must ship, `Prompt` means the default
Paperclip prompt below carries it for now.

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

TO-DO: Delete this section
✅ built · 🔬 human researcher in progress

**G6, G7 and G9 are P1** because they are the three gates where the literature genuinely disagrees
— normalization strategy, rarefaction depth, distance metric. A prompt cannot settle a live
disagreement in the field, so these need curated tables. A researcher is compiling them; the default
prompt stands in until they land.

TO-DO: Delete this section
## Evidence strategy

Every gate ships with an evidence source from day one. The two modes are interchangeable at the API
boundary — both produce the same response shape — so a gate can be promoted from Prompt to Table
without touching the client.

| Mode | Source | Use |
|---|---|---|
| **Table** | Curated T-table, versioned JSON | Thresholds that must be identical on every run |
| **Prompt** | Paperclip retrieval at run time | Everything else, until a table exists |

Retrieval goes through Paperclip (`.claude/skills/paperclip`), a virtual filesystem of full-text
biomedical papers. The CLI is not installed yet, so the exact command surface is unverified — see
Open questions.

### Default prompt

Used by any gate marked `Prompt`. One prompt, parameterised by gate — not one prompt per gate.

```
You supply evidence for a single analysis decision. Retrieve literature with the
Paperclip CLI. Do not compute statistics. Every number you return must appear in a
source you retrieved.

INPUT
  gate_id, question, candidate_values[], dataset_context

OUTPUT — strict JSON, no prose
{
  "gate_id": "G10",
  "options": [
    { "value": <one of candidate_values>,
      "recommended": true|false,
      "claim": "<one sentence: what this choice assumes, or what it costs>",
      "citations": [ { "ref_key", "doi", "locator", "quote" } ] }
  ],
  "positions": [ { "side", "claim", "ref_key", "doi" } ],
  "unsupported": [ <candidate values no retrieved source backs> ]
}

TO-DO: review with alex before apply
RULES
- A candidate with no citation goes in `unsupported`. Never invent a source.
- `quote` is verbatim from the retrieved text. `locator` names the section or figure.
- Max 2 citations per option.
- Fill `positions` only when sources disagree. Do not manufacture a debate.
- Return candidate_values unchanged. Proposing a value nobody asked about is out of scope.
```

The output is the interim shape of a T-table row. When the researcher delivers a table for a gate,
the prompt is retired for that gate and the rows are frozen — same fields, no retrieval at run time.

## Page → gate map

| Page | Gates | Panels (no decision) |
|---|---|---|
| Upload | — | drop zone, schema contract, prompt chips |
| Design | G1 G2 G3 G4 | — |
| Raw QC | G5 | depth chart, sanity checklist |
| Normalize | G6 G7 | rarefaction curves, retention, debate |
| Alpha | G8 | composition, sample detail, alpha metrics |
| Beta | G9 | PCoA, PERMANOVA strip, distance matrix |
| Differential | G10 | volcano, known-taxa, artifact warnings |
| Summary | — | sources, decision log, reproducibility |

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

**R1 is not "the two numbers differ".** It fires only when a sample is flagged by G5 *and* survives
G7 — that is, flagged as under-sequenced and analysed anyway. Warning whenever the numbers merely
differ makes the default state cry wolf.

## Invalidation

Which gate kills which cached result. This table is the source for `gates.json`; the client store
and the server's recompute logic must both read it rather than each keeping their own copy.

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

Every `G*.md` uses the same ten sections, in this order. A section that does not apply says
"None", it is never dropped — otherwise "not decided" and "decided, none" become indistinguishable.

```
1. Anchor        DOM id in the mock + page
2. Layer         which of Compute / Reasoning / Evidence produces each field
3. Endpoint      method + path
4. Request       inputs, and which upstream gates it depends on
5. Response      every number on screen, named
6. Invalidation  what dies when this changes
7. Evidence      which T-table backs the copy and the thresholds
8. States        empty, disabled, failed, single-cohort
9. Decision log  what is recorded, and when
10. Open         not yet decided
```

Layer discipline, restated because it is the whole trust argument:

- **Compute** produces numbers. It never writes a sentence.
- **Reasoning** (Claude) selects and explains. It never produces a number that Compute did not hand it.
- **Evidence** supplies thresholds, citations and message templates from versioned tables (T-series).

Each file closes with **Deviations** — points where the mock's behaviour must not be ported as-is.

## Open questions

1. Paperclip interface. The project skill describes a **CLI** (`paperclip skill`,
   `paperclip routines route`), while the earlier interface plan assumed an **MCP** server. The CLI
   is not installed, so neither is confirmed. This decides how the Evidence layer is called.
2. G6 / G7 / G9 tables are with the researcher. Until they land, those three gates run on the
   default prompt, which means their thresholds are not reproducible between runs.

## Related

TO-DO: Delete this section

- `MB-hackathon-prep/gut-pilot-flow-spec-260814.md` — gate inventory this expands
- `MB-hackathon-prep/evidence-tables-needed-260815.md` — T1–T36, the evidence gaps
- `MB-hackathon-prep/evidence-tables/` — T-tables built so far (T4 only)
- `MB-hackathon-prep/api-doc-format-proposal-260815.md` — why the template looks like this
