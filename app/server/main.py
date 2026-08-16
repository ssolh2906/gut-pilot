"""FastAPI app - the HTTP surface the frontend talks to.

Foundation-scope: one gate (G6, normalization) wired end-to-end through all
three layers (Compute -> Reasoning -> Evidence), on a synthetic fixture
dataset until real ingestion lands. See docs/gates.md for the full gate
contract this is built against.
"""

import math

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from compute.fixtures import make_fixture_count_table
from compute.p03_qc_checks import depth_summary, flag_below_floor
from compute.p04_rarefaction import build_rarefaction_curve, samples_above_depth
from compute.p05_alpha_diversity import alpha_group_test, compute_alpha_diversity
from reasoning.g6_normalization import apply_g6_strategy, build_g6_response
from session_store import create_session, get_session

app = FastAPI(title="Gut Pilot Reviewer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/session")
def new_session():
    """Start a run. Loads the fixture dataset until real upload is wired up."""
    table = make_fixture_count_table()
    session = create_session(table)
    return {
        "session_id": session.id,
        "n_samples": table.shape[1],
        "n_features": table.shape[0],
        "sample_ids": list(table.columns),
    }


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


# Alpha diversity (Alpha page) - Compute-only, same reasoning as G5/G7 above.
# Grouping isn't real metadata yet (no G1 group field on Session) - it falls
# back to the sample_id prefix before "-" (e.g. "H-01" -> "H"), which is the
# convention the fixture data itself follows.


@app.get("/api/session/{sid}/alpha")
def get_alpha_diversity(sid: str, depth: int | None = None, n_iterations: int = 20):
    session = _require_session(sid)
    threshold = session.threshold if depth is None else depth
    rng = np.random.default_rng(0)
    raw = compute_alpha_diversity(session.count_table, threshold, n_iterations, rng)

    groups: dict[str, list[str]] = {}
    for sample_id in session.count_table.columns:
        groups.setdefault(sample_id.split("-")[0], []).append(sample_id)

    group_tests = {}
    if len(groups) == 2:
        for metric in raw.index:
            values_by_group = {g: raw.loc[metric, ids].dropna().tolist() for g, ids in groups.items()}
            if all(values_by_group.values()):
                group_tests[metric] = alpha_group_test(values_by_group)

    metrics = {
        sample: {
            metric: (None if math.isnan(v := raw.loc[metric, sample]) else float(v))
            for metric in raw.index
        }
        for sample in raw.columns
    }

    return {
        "depth": threshold, "n_iterations": n_iterations,
        "metrics": metrics, "groups": groups, "group_tests": group_tests,
    }
