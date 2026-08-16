# Gut Pilot

Microbiome analysis platform with an evidence-grounded reviewer, built for the 2026 re:AGENT hackathon.

For the presentation sequence, expected Baxter results, and recovery steps, use [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md).

## Demo startup

In two terminals:

```bash
cd app/server
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```bash
cd app/client
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`, enable **Proceed with recommended options**, and drop
`data/MicrobiomeHD/crc_baxter_results.tar.gz` into the upload panel. The autonomous path uses the real archive through ingestion, study design, QC, data-derived normalization, alpha diversity, repeated-rarefaction Jaccard beta diversity, differential abundance, and the final synthesis.

## Reasoning providers

Claude remains the default. The configured OpenAI fallback is also attempted when Claude returns an invalid structured gate response, not only when the request itself fails. If neither provider yields a usable response, every reasoning gate returns a data-grounded deterministic response so the compute pipeline and demo continue instead of exposing a provider error.

For tomorrow's intended setup, keep Claude primary and use OpenAI only if Claude is unavailable:

```bash
export ANTHROPIC_API_KEY='set-this-in-your-shell-or-secret-manager'
export GUT_PILOT_LLM_FALLBACK=openai
export OPENAI_API_KEY='set-this-in-your-shell-or-secret-manager'
export OPENAI_MODEL=gpt-5.6
export GUT_PILOT_LLM_TIMEOUT_SECONDS=45
```

OpenAI can also be selected explicitly as the primary server-side provider:

```bash
export GUT_PILOT_LLM_PROVIDER=openai
export OPENAI_API_KEY='set-this-in-your-shell-or-secret-manager'
export OPENAI_MODEL=gpt-5.6
export GUT_PILOT_LLM_FALLBACK=anthropic
```

Do not put API keys in this repository or frontend environment variables. The application only reads provider credentials from the server process environment. Remove `GUT_PILOT_LLM_PROVIDER` (or set it to `anthropic`) to use the original Claude path tomorrow.

## Verification

```bash
app/server/.venv/bin/python scripts/demo_preflight.py
app/server/.venv/bin/python -m pytest -q tests
app/server/.venv/bin/python tests/eval/test_data_quality_checks.py
app/server/.venv/bin/python app/server/run_pipeline.py --dataset crc_baxter --out /tmp/gut-pilot-run.json
app/server/.venv/bin/python tests/eval/runner.py --run /tmp/gut-pilot-run.json --skip-judge
cd app/client && npm test && npm run lint && npm run build
```
