"""FastAPI app - the HTTP surface the frontend talks to.

G6 (normalization) and G4 (taxonomic rank) are wired end-to-end through all
three layers (Compute -> Reasoning -> Evidence), running on the real
crc_baxter dataset by default. See docs/gates.md for the full gate contract
this is built against.
"""

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from compute.fixtures import make_fixture_count_table
from compute.ingestion import load_dataset, load_uploaded_dataset
from compute.p02_taxonomy import aggregate_by_rank
from compute.p03_qc_checks import depth_summary, flag_below_floor
from compute.p04_rarefaction import build_rarefaction_curve, samples_above_depth
from reasoning.chatbot import chat_session
from reasoning.g4_taxonomic_rank import apply_g4_rank, build_g4_response
from reasoning.g6_normalization import apply_g6_strategy, build_g6_response
from reasoning.g8_alpha_diversity import build_g8_response
from reasoning.g9_beta_diversity import build_g9_response
from reasoning.study_design import build_study_design_response
from session_store import create_session, get_session

app = FastAPI(title="Gut Pilot Reviewer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _session_response(session):
    return {
        "session_id": session.id,
        "n_samples": session.count_table.shape[1],
        "n_features": session.count_table.shape[0],
        "sample_ids": list(session.count_table.columns),
        "parse_report": session.parse_report,
    }


@app.post("/api/session")
def new_session(dataset: str = "crc_baxter", count_table: UploadFile | None = File(None)):
    """Start a run.

    If a count_table file is uploaded (a .tar.gz in the same MicrobiomeHD
    format as the bundled datasets), it's extracted and parsed for real.
    Otherwise falls back to `dataset` - "crc_baxter" (default, real data) or
    "fixture" (fast synthetic dataset for dev/demo, no real per-OTU data
    behind it, so G4 isn't meaningful on it).
    """
    if count_table is not None:
        try:
            result = load_uploaded_dataset(count_table.file)
        except (ValueError, KeyError) as e:
            raise HTTPException(status_code=400, detail=f"could not parse uploaded file: {e}")
        genus_table = aggregate_by_rank(result.raw_counts, "genus")
        session = create_session(
            genus_table,
            raw_counts=result.raw_counts,
            taxonomy_map=result.taxonomy_map,
            metadata=result.metadata,
            parse_report=result.parse_report,
        )
        return _session_response(session)

    if dataset == "fixture":
        table = make_fixture_count_table()
        session = create_session(table)
        return _session_response(session)

    result = load_dataset(dataset)
    genus_table = aggregate_by_rank(result.raw_counts, "genus")
    session = create_session(
        genus_table,
        raw_counts=result.raw_counts,
        taxonomy_map=result.taxonomy_map,
        metadata=result.metadata,
        parse_report=result.parse_report,
    )
    return _session_response(session)


def _require_session(sid: str):
    try:
        return get_session(sid)
    except KeyError:
        raise HTTPException(status_code=404, detail="session not found")


@app.get("/api/session/{sid}/normalize/strategy")
def get_normalize_strategy(sid: str):
    session = _require_session(sid)
    return build_g6_response(session)


class StrategyBody(BaseModel):
    strategy: str


@app.post("/api/session/{sid}/normalize/strategy")
def set_normalize_strategy(sid: str, body: StrategyBody):
    session = _require_session(sid)
    try:
        return apply_g6_strategy(session, body.strategy)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/session/{sid}/design/study-design")
def get_study_design(sid: str):
    session = _require_session(sid)
    try:
        return build_study_design_response(session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/session/{sid}/design/rank")
def get_design_rank(sid: str):
    session = _require_session(sid)
    try:
        return build_g4_response(session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class RankBody(BaseModel):
    rank: str


@app.post("/api/session/{sid}/design/rank")
def set_design_rank(sid: str, body: RankBody):
    session = _require_session(sid)
    try:
        return apply_g4_rank(session, body.rank)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/session/{sid}/alpha/significance")
def get_alpha_significance(sid: str):
    session = _require_session(sid)
    return build_g8_response(session)


@app.get("/api/session/{sid}/beta/metric")
def get_beta_metric(sid: str):
    session = _require_session(sid)
    return build_g9_response(session)


class ChatBody(BaseModel):
    message: str
    page: str | None = None


@app.post("/api/session/{sid}/chat")
def post_chat(sid: str, body: ChatBody):
    session = _require_session(sid)
    return chat_session(session, body.message, page=body.page)


# G5 (QC depth floor) and G7 (rarefaction depth) below are Compute-only for
# now: no Reasoning/Evidence layer, since their advisory rules (T9-T15) and
# G1 group data aren't built yet - see docs/gates/G5.md and G7.md. These
# return the raw numbers Compute produces, nothing more.


@app.get("/api/session/{sid}/qc/depth")
def get_qc_depth(sid: str):
    session = _require_session(sid)
    depths = session.count_table.sum(axis=0).sort_values()
    bars = [{"sample_id": s, "depth": int(d)} for s, d in depths.items()]
    return {"gate_id": "G5", "stats": depth_summary(session.count_table), "bars": bars}


@app.get("/api/session/{sid}/qc/floor")
def get_qc_floor(sid: str, value: int = 5000):
    session = _require_session(sid)
    depths = session.count_table.sum(axis=0).to_dict()
    flagged = flag_below_floor(depths, value)
    return {
        "gate_id": "G5", "floor": value,
        "flagged": flagged, "n_flagged": len(flagged), "n_total": len(depths),
    }


@app.get("/api/session/{sid}/rarefaction/retention")
def get_rarefaction_retention(sid: str, depth: int | None = None):
    session = _require_session(sid)
    depths = session.count_table.sum(axis=0).to_dict()
    threshold = session.threshold if depth is None else depth
    split = samples_above_depth(depths, threshold)
    return {"gate_id": "G7", "depth": threshold, **split}


@app.get("/api/session/{sid}/rarefaction/curves")
def get_rarefaction_curves(sid: str, n_steps: int = 12, n_iter: int = 3):
    session = _require_session(sid)
    df = session.count_table
    max_depth = int(df.sum(axis=0).max())
    steps = np.linspace(200, max_depth, n_steps).astype(int)
    rng = np.random.default_rng(0)
    curves = {
        sample_id: build_rarefaction_curve(df[sample_id].to_numpy(), steps, n_iter, rng)
        for sample_id in df.columns
    }
    return {"gate_id": "G7", "curves": curves}
