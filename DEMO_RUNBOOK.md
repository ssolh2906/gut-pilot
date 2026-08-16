# Gut Pilot hackathon demo runbook

## 1. Start clean

Use two terminals from the repository root. Do not use Uvicorn reload mode for the presentation.

```bash
cd app/server
GUT_PILOT_LLM_FALLBACK=openai .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```bash
cd app/client
npm run dev -- --host 127.0.0.1
```

Open <http://127.0.0.1:5173> and confirm the upload screen appears.

## 2. Thirty-second preflight

```bash
curl -s http://127.0.0.1:8000/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/
```

Expected: API `status` is `ok`, `demo_fallback_ready` is `true`, active sessions are `0`, and the frontend returns `200`.

To verify the real upload, every live analysis endpoint, the expected Baxter result, cached summary performance, and session cleanup in one command:

```bash
app/server/.venv/bin/python scripts/demo_preflight.py
```

Expected: `PASS — live Baxter demo path`, `core=4/4`, and `sessions cleaned up`.

For a fuller preflight:

```bash
app/server/.venv/bin/python -m pytest -q tests
cd app/client && npm test && npm run lint && npm run build
```

Current expected result: 21 backend tests and 10 frontend tests pass.

## 3. Primary demo path

1. Turn on **Proceed with recommended options**.
2. Drag `data/MicrobiomeHD/crc_baxter_results.tar.gz` onto the upload zone.
3. Let the workflow advance on its own. Fresh compute takes roughly 6–7 seconds on the tested laptop; the deliberate UI pacing makes the full story about 10 seconds.
4. On **Run summary**, point to the computed Jaccard R², p-value, and `CORE 4/4` badges.
5. Optionally download the **audit bundle** after the button becomes enabled.

## 4. Expected scientific story

- Ingestion: 490 samples and 122,510 raw OTUs; 254 named genera after aggregation.
- Study design: metadata-defined `DiseaseState`; H=172, CRC=120, nonCRC/adenoma=198. The nonCRC arm is excluded from the H-versus-CRC comparison, not silently pooled with controls.
- Normalization: data-derived depth of 2,100 reads. The published 10,000-read depth would retain only H=80 and CRC=69 on this reprocessed table.
- Alpha diversity: Shannon is not significant (p approximately 0.8), while observed genus richness is significantly higher in CRC (p below 0.01). This is taxon-specific enrichment, not a global diversity collapse.
- Beta diversity: repeated-rarefaction Jaccard PERMANOVA p=0.001, R² approximately 0.012, with dispersion reported alongside it and not significant in this run.
- Differential abundance: all four prespecified CRC-associated genera are recovered—Fusobacterium, Parvimonas, Peptostreptococcus, and Porphyromonas.
- Conclusion: this is a replication of established Baxter/Duvallet findings, not a new biomarker claim, diagnostic result, or causal conclusion.

## 5. Recovery paths

- If a file is unavailable or rejected, click **Use bundled Baxter demo**. It uses the same real cohort through the same backend pipeline.
- If the browser view itself fails, use **Refresh Gut Pilot**, then upload again. Replacement runs start with clean gate state and release the prior backend session.
- If Claude is unavailable or returns an invalid gate response, OpenAI gets the configured fallback attempt. If neither provider yields a valid response, the compute workflow continues with transparent `data_grounded_fallback` reasoning. Do not stop the demo to fix provider credentials.
- If several heavy rehearsals have already run, restart only the API before presenting. This returns allocator memory to baseline; no data or code is lost.

## 6. Provider configuration

Claude remains primary. OpenAI is an optional server-side fallback:

```bash
export ANTHROPIC_API_KEY='from-your-secret-manager'
export OPENAI_API_KEY='from-your-secret-manager'
export GUT_PILOT_LLM_FALLBACK=openai
export GUT_PILOT_LLM_TIMEOUT_SECONDS=45
```

Never paste keys into the browser, source files, `.env` files intended for commit, screenshots, or presentation slides. With no credentials, the data-grounded fallback is the safest and fastest demo configuration.

## 7. If a judge asks what is still prototype-level

- The current DA benchmark is transparent relative abundance + Mann–Whitney + BH; ALDEx2 or ANCOM-BC is the next primary-model integration.
- Genus-level 16S cannot resolve species or strains.
- The cohort is cross-sectional, so it supports association rather than causality.
- Low-depth exclusion is asymmetric between H and CRC and remains a sensitivity concern.
- Cross-cohort validation should run the identical locked workflow on the other bundled CRC cohorts.
