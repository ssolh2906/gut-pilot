# Gut Pilot

AI Scientist for microbiome analysis. It runs the full pipeline — QC, normalization, diversity, differential abundance — through an agent that follows science-backed rules and checks its work against the literature, turning weeks of manual analysis into one run.

**Demo:** https://youtu.be/TODFMwWbjeA?si=tVPTmWopzAp0Pjpo

## Build

**1. Get an API key** — [console.anthropic.com](https://console.anthropic.com/settings/keys)

**2. Set it**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**3. Run server**

```bash
cd app/server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**4. Run client**

```bash
git clone git@github.com:ssolh2906/gut-pilot.git
cd gut-pilot/app/client
npm install
npm run dev
```

Open http://localhost:5173

## Structure

```
gut-pilot/
├── app/
│   ├── server/          # FastAPI backend
│   │   ├── compute/     # bioinformatics functions (QC, normalization, diversity, DA)
│   │   ├── reasoning/   # agent logic per gate + Paperclip literature checks
│   │   └── main.py
│   └── client/           # React + Vite frontend
│       └── src/
│           ├── pages/    # one page per pipeline gate
│           └── components/
├── data/raw_data/        # bundled demo datasets (crc_baxter, cdi_schubert)
├── docs/gates/           # spec for each pipeline gate (G1–G10)
├── research/             # methods notes + ground-truth test cases
└── tests/eval/           # agent eval harness
```

## Data

Demo dataset: Baxter et al., *Genome Medicine* 2016 (colorectal cancer, 16S rRNA) — [SRA BioProject PRJNA290926](https://www.ncbi.nlm.nih.gov/bioproject/PRJNA290926)

## Built by

Solhee Tucker, Alexander Schubert, Darren He

Built at GXL Hackathon 2026.
