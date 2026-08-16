# Gut Pilot eval harness

Machinery to grade one pipeline run against `research/09_test_cases_crc_baxter.md`
and turn that into a loop: run the pipeline, grade it, see exactly which test
IDs got better or worse than last time, repeat. Built ahead of the backend
MVP so it's ready the moment there's a real agent output to point it at.

**Status as of 2026-08-16: all 37 checks are ready.** The live Baxter
pipeline passes all 29 numeric/structural checks. The 8 qualitative checks
are also covered by `tests/test_baxter_narrative_contract.py`; this harness
can additionally grade them with a live LLM whenever an authenticated judge
is available. Try it yourself:

```bash
python tests/eval/runner.py --run tests/eval/fixtures/run_result.gold.json
# -> 37/37 pass, exit 0

python tests/eval/runner.py --run tests/eval/fixtures/run_result.bad_example.json
# -> 14/33 ready tests pass, 5 flagged CRITICAL, exit 1
```

## Layout

```
tests/eval/
  schema/run_result.schema.json    the RUN.json contract (PROPOSED -- see below)
  schema/run_result.md             what each section means, in prose
  manifest/crc_baxter_manifest.json  all 37 checks from research/09, machine-readable
  runner.py                        grades one RUN.json against the manifest
  judge.py                         LLM-judge backend for the qualitative checks
  loop.py                          the iteration driver: run -> archive -> diff vs last time
  fixtures/run_result.gold.json    hand-built, passes all 37 (proves the harness works)
  fixtures/run_result.bad_example.json  deliberately reproduces 5 known failure modes
  reports/                         where loop.py archives each iteration (gitignored contents)
```

## Two kinds of checks, one command

`research/09` has 37 test cases. 29 are numeric/structural and graded in
pure Python -- no model call, instant, free. 8 are qualitative (does the
gate-note actually say the right thing) and graded by an LLM judge. Both run
from the same command; `runner.py` routes each check to the right grader
automatically.

```bash
# Everything, including live LLM grading of the 8 qualitative checks:
python tests/eval/runner.py --run path/to/run_result.json

# Fast pass, numeric checks only, no model call (good for a tight edit-test loop):
python tests/eval/runner.py --run path/to/run_result.json --skip-judge

# Just check the JSON shape is even valid before grading anything:
python tests/eval/runner.py --run path/to/run_result.json --schema-only
```

Exit code is `0` iff every non-blocked test passes -- wire it into a
pre-merge hook or CI step directly.

## Judge provider fallback

The qualitative checks need an LLM to grade prose against a rubric (a regex
can't tell whether a gate-note "acknowledges both published normalization
precedents"). `judge.py` runs those through the **`claude` CLI in
non-interactive mode** (`claude -p --output-format json`), which reuses
whatever auth is already active for your Claude Code session. If that route
is missing or logged out, it tries `ANTHROPIC_API_KEY`, then the OpenAI
Responses API when `OPENAI_API_KEY` is available. The OpenAI verdict uses a
strict structured-output schema. If none is authenticated, those 8 checks
report `SKIPPED`, never a silent pass or an evaluator crash. API keys stay in
the evaluator process environment and are never written to the repository.

One thing worth knowing: the first llm_judge call in this file's history hit
a real LLM-judge failure mode -- the model's `reasoning` field argued for
FAIL while its `pass` field said `true`. Fixed by asking for `reasoning`
before `pass` in the requested JSON shape, which forces the verdict to
follow the stated reasoning instead of being decided independently (see
`GRADER_SYSTEM_PROMPT` in `judge.py`). Re-verified 3/3 consistent after the
fix. If a judge verdict on a CRITICAL check ever looks inconsistent with its
own reasoning again, that's the first thing to check.

## The RUN.json contract

`schema/run_result.schema.json` + `schema/run_result.md` define what the
agent pipeline needs to emit. **This is a proposal, not a spec handed down
from on high** -- confirm field names with whoever owns the reasoning
layer/backend MVP once it exists. The important design point either way:
`differential_abundance.genera` must include every genus that was *tested*,
not just the ones that came out significant, or the negative-control test
(TC-7.4 -- Faecalibacterium/Blautia/Bacteroides must NOT be claimed
significant) has nothing to check.

If the real pipeline's output uses different field names, fix the `path` in
`manifest/crc_baxter_manifest.json`, not the schema or the runner. If a whole
section is structurally different, that's worth a quick conversation before
grading anything.

## Using this as a loop for iterative improvement

This is the actual point of the exercise -- not "does it pass once" but "did
this change to the agent make things better or worse than last time."

```bash
# First run after the backend MVP lands -- this becomes the baseline:
python tests/eval/loop.py --run /path/to/pipeline/output.json --label "first real run"

# After every subsequent change to a prompt, a gate's logic, a compute function:
python tests/eval/loop.py --run /path/to/pipeline/output.json --label "tightened G6 gate-note prompt"

# Once the pipeline has a CLI entrypoint, skip the manual copy step entirely:
python tests/eval/loop.py \
  --cmd "python app/server/run_pipeline.py --dataset crc_baxter --out {out}" \
  --label "tightened G6 gate-note prompt"
```

Every call prints a delta against the previous run:

```
DELTA VS PREVIOUS RUN
  Newly passing : ['TC-4.1']
  Newly failing : none
  Still failing : ['TC-2.3', 'TC-6.1', 'TC-6.2']
  Not graded (skipped in either run) : none
```

...and archives the full run + report under `reports/<timestamp>__<label>/`,
appending one line to `reports/history.jsonl` so the whole iteration history
is inspectable later (e.g. to make a "pass rate over time" chart for the
demo). This is the loop: change something, run it, read the delta, repeat
until "Newly failing" stays empty and "Still failing" shrinks to nothing.

## Known limitations, on purpose left unfixed for now

- **Single dataset.** Everything is pinned to `crc_baxter`. This catches
  regressions against one known-answer cohort; it will not tell you if the
  agent is overfitting its prompts to Baxter's specific genera. Worth adding
  a second MicrobiomeHD cohort (`cdi_schubert` is already scoped in
  `research/`) as a held-out check once this one is solid.
- **No blocked tests remain.** TC-2.3, TC-4.2, TC-6.1, and TC-6.2 moved to
  ready after the study-design reasoning, data-driven depth selection,
  PERMANOVA, and dispersion implementations landed.
- **LLM-judge is a single call per check**, not a majority vote. The
  reasoning-before-pass fix resolved the one inconsistency found during
  development, but for CRITICAL-severity qualitative checks in a real
  production loop, calling the judge 3x and requiring 2/3 agreement (the
  adversarial-verify pattern) would be a reasonable next hardening step if
  flakiness resurfaces -- not implemented here to keep the harness simple
  while nothing has been run against it yet.
