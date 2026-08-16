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
from compute.p05_alpha_diversity import alpha_group_test, compute_alpha_diversity
from compute.p05_stats_utils import multiple_testing_correction
from reasoning.chatbot import chat_session
from reasoning.g4_taxonomic_rank import apply_g4_rank, build_g4_response
from reasoning.g6_normalization import apply_g6_strategy, build_g6_response
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


def _group_for_sample(session, sample_id: str) -> str | None:
    """Best-effort group label from real metadata (DiseaseState, the column
    both bundled MicrobiomeHD datasets use), for display purposes only --
    this is NOT the reasoning layer's G1 group-definition decision, just
    enough to color the QC chart before Design has run. Returns None on the
    fixture path (no metadata) or if the column isn't present, and callers
    must handle that by falling back to an ungrouped display.
    """
    if session.metadata is None or "DiseaseState" not in session.metadata.columns:
        return None
    if sample_id not in session.metadata.index:
        return None
    return str(session.metadata.loc[sample_id, "DiseaseState"])


@app.get("/api/session/{sid}/qc/depth")
def get_qc_depth(sid: str):
    session = _require_session(sid)
    depths = session.count_table.sum(axis=0).sort_values()
    bars = [
        {"sample_id": s, "depth": int(d), "group": _group_for_sample(session, s)}
        for s, d in depths.items()
    ]
    return {
        "gate_id": "G5",
        "stats": depth_summary(session.count_table),
        "n_features": int(session.count_table.shape[0]),
        "bars": bars,
    }


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


# ---- G8 (alpha diversity) --------------------------------------------------
# Compute-only for now, same reasoning as G5/G7 above: no Reasoning/Evidence
# layer yet, so this returns the numbers Compute produces, nothing more. The
# significance-settings choice (alpha level, correction method) is a policy
# pick, not something Claude needs to weigh in on, so this being compute-only
# is the intended end state for G8, not a temporary gap like G5/G7 are.

_PRIMARY_COMPARISON = ("H", "CRC")  # matches every bundled dataset's framing


def _comparison_groups(session, sample_ids: list[str]) -> tuple[str, str] | None:
    """Pick the two groups to run the significance test on. Prefers H vs CRC
    (the framing every bundled dataset and the rest of the UI already
    assumes) when both are present; falls back to whatever two groups exist
    if there are exactly two; returns None if there's no metadata, or more
    than two groups without an H/CRC pair to anchor on."""
    groups = {sid: _group_for_sample(session, sid) for sid in sample_ids}
    distinct = sorted({g for g in groups.values() if g is not None})
    if all(g in distinct for g in _PRIMARY_COMPARISON):
        return _PRIMARY_COMPARISON
    if len(distinct) == 2:
        return tuple(distinct)
    return None


@app.get("/api/session/{sid}/alpha/diversity")
def get_alpha_diversity(sid: str, correction: str = "bh", n_iterations: int = 100):
    session = _require_session(sid)
    df = session.count_table
    sample_ids = list(df.columns)
    groups = {sid_: _group_for_sample(session, sid_) for sid_ in sample_ids}

    rng = np.random.default_rng(0)
    per_sample = compute_alpha_diversity(df, depth=session.threshold, n_iterations=n_iterations, rng=rng)
    metrics = list(per_sample.index)

    comparison = _comparison_groups(session, sample_ids)
    group_means: dict[str, dict[str, float]] = {}
    significance: dict[str, dict] = {}
    if comparison:
        group_a, group_b = comparison
        p_values = []
        for metric in metrics:
            values_by_group = {
                g: [per_sample.loc[metric, s] for s in sample_ids if groups[s] == g and not np.isnan(per_sample.loc[metric, s])]
                for g in comparison
            }
            group_means[metric] = {g: (float(np.mean(v)) if v else None) for g, v in values_by_group.items()}
            if all(len(v) >= 2 for v in values_by_group.values()):
                test = alpha_group_test(values_by_group)
                significance[metric] = test
                p_values.append(test["p_value"])
            else:
                significance[metric] = None
                p_values.append(None)

        testable = [i for i, p in enumerate(p_values) if p is not None]
        if testable:
            q_values = multiple_testing_correction([p_values[i] for i in testable], correction, len(testable))
            for i, q in zip(testable, q_values):
                significance[metrics[i]]["q_value"] = q
                significance[metrics[i]]["correction"] = correction

    return {
        "gate_id": "G8",
        "depth": session.threshold,
        "n_iterations": n_iterations,
        "comparison_groups": list(comparison) if comparison else None,
        "excluded_groups": sorted({g for g in groups.values() if g is not None and (not comparison or g not in comparison)}),
        "per_sample": {
            s: {m: (None if np.isnan(v := per_sample.loc[m, s]) else float(v)) for m in metrics}
            for s in sample_ids
        },
        "sample_groups": groups,
        "group_means": group_means,
        "significance": significance,
    }
