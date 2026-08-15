# Gates — index

The mock (`MB-hackathon-prep/mockup/gut-pilot mock 260814.html`) is the specification.
This directory is that mock written down as a contract. Where the two disagree, the mock wins
until a gate file says otherwise in its **Deviations** section. >> 이 문서 전체가 output 이니까 이런건 제거해. 깔끔하게 스펙만 유지.

A **gate** is a point where the run cannot proceed on the agent's judgement alone. The agent
proposes, the reviewer disposes, and the decision is recorded. Everything else on a page is a
panel: it renders, it does not decide.

Written in English to match `gut-pilot-flow-spec-260814.md`, which defines these IDs. >> 삭제

---

## The ten gates
>> 코멘트, 수정 후 내 코멘트들 삭제할 것. 게이트들은 구현 우선순위가 있음. 몇몇 게이트는 필수로 근거 테이블을 가져야하고, 몇몇개는 프롬프트만 해커톤 기간내에 넣을것임.  디폴트로, paper clip api 사용해서 literature 정보와 함께 정해진 아웃풋을 내놓는 프롬프트를 넣어두자. 우선순위 높은건 G6, G7, G9. 인간 리서처가 조사중임. 일단 디폴트프롬프트 넣어두자. 최대한 간결하게. 

| ID | Gate | Page | Decides | Detail | 
|---|---|---|---|---|
| G1 | Group definition | Design | What is being compared. Turns every group test on or off. | [G1.md](gates/G1.md) |
| G2 | Batch confounding | Design | Whether a processing effect can be separated from the disease effect. | [G2.md](gates/G2.md) |
| G3 | Sample independence | Design | The test family. Wrong here invalidates every p-value on the run. | [G3.md](gates/G3.md) |
| G4 | Taxonomic rank | Design | Feature count, and whether a marker can be named at all. | [G4.md](gates/G4.md) |
| G5 | QC depth floor | Raw QC | Which samples are *flagged* as under-sequenced. Flags only, never excludes. | [G5.md](gates/G5.md) |
| G6 | Normalization strategy | Normalize | How uneven depth is handled. Constrains G7 and G9. | [G6.md](gates/G6.md) |
| G7 | Rarefaction depth | Normalize | Which samples are *excluded*. Active only under G6 = Rarefaction. | [G7.md](gates/G7.md) |
| G8 | Significance settings | Alpha | Every p and q on Alpha, Beta and Differential. | [G8.md](gates/G8.md) |
| G9 | Distance metric | Beta | What "different" means between two samples. | [G9.md](gates/G9.md) |
| G10 | Prevalence filter | Differential | How many features are tested, and therefore correction stringency. | [G10.md](gates/G10.md) |

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
>> 템플릿은 맘에듬. 하나하나 점검해볼게 내가

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

## Related
>> 이들은 이 프로젝트에 포함되지않아. 따라서 플젝 마무리단계에서 삭제. 지금은 놔둬
TO-DO: Delete this section

- `MB-hackathon-prep/gut-pilot-flow-spec-260814.md` — gate inventory this expands
- `MB-hackathon-prep/evidence-tables-needed-260815.md` — T1–T36, the evidence gaps
- `MB-hackathon-prep/evidence-tables/` — T-tables built so far (T4 only)
- `MB-hackathon-prep/api-doc-format-proposal-260815.md` — why the template looks like this
