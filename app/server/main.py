"""FastAPI app - the HTTP surface the frontend talks to.

Foundation-scope: one gate (G6, normalization) wired end-to-end through all
three layers (Compute -> Reasoning -> Evidence), on a synthetic fixture
dataset until real ingestion lands. See docs/gates.md for the full gate
contract this is built against.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from compute.fixtures import make_fixture_count_table
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
