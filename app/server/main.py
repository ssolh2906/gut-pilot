"""FastAPI app - the HTTP surface the frontend talks to.

G6 (normalization) and G4 (taxonomic rank) are wired end-to-end through all
three layers (Compute -> Reasoning -> Evidence), running on the real
crc_baxter dataset by default. See docs/gates.md for the full gate contract
this is built against.
"""

import math

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from compute.fixtures import make_fixture_count_table
from compute.ingestion import load_dataset, load_uploaded_dataset
from compute.p02_design import classify_metadata_columns
from compute.p02_taxonomy import aggregate_by_rank
from compute.p03_qc_checks import depth_summary, flag_below_floor
from compute.p04_rarefaction import (
    expected_richness_curve,
    samples_above_depth,
    suggest_plateau_depth,
)
from compute.p05_alpha_diversity import alpha_group_test, compute_alpha_diversity
from compute.p06_beta_diversity import (
    aitchison_matrix,
    bray_curtis_matrix,
    jaccard_matrix,
    pcoa_ordination,
    relative_abundance,
    run_permanova,
)
from compute.p07_artifact_checks import check_normalization_metric_mismatch
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


def _prefix_groups(sample_ids) -> dict[str, list[str]]:
    """No real G1 group metadata on Session yet - fall back to the sample_id
    prefix before "-" (e.g. "H-01" -> "H"), the convention the fixture itself
    follows. Replace with a real metadata-driven grouping once G1 lands.
    """
    groups: dict[str, list[str]] = {}
    for sample_id in sample_ids:
        groups.setdefault(sample_id.split("-")[0], []).append(sample_id)
    return groups


def _sample_group_labels(session) -> dict[str, str]:
    """Best-effort real per-sample group label for display (e.g. the real
    DiseaseState column), independent of G1's own reasoning-layer grouping
    choice in study_design.py - this is just for coloring/labeling a chart,
    not a claim about which grouping is the "right" comparison. Picks the
    likely_outcome metadata column with the fewest distinct values (the
    cleanest candidate) when more than one matches; falls back to the
    sample_id prefix convention when there's no real metadata at all
    (fixture dataset)."""
    sample_ids = list(session.count_table.columns)
    if session.metadata is None:
        return {sid: (sid.split("-")[0] if "-" in sid else "sample") for sid in sample_ids}
    classified = classify_metadata_columns(session.metadata)
    outcome_cols = [c for c, info in classified.items() if info["role"] == "likely_outcome"]
    if not outcome_cols:
        return {sid: "sample" for sid in sample_ids}
    col = min(outcome_cols, key=lambda c: classified[c]["n_unique"])
    sub = session.metadata.loc[session.metadata.index.isin(sample_ids), col]
    return {str(k): str(v) for k, v in sub.to_dict().items()}


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
def get_rarefaction_curves(sid: str, n_points: int = 24):
    """Real per-sample rarefaction curves for the Normalize page's chart,
    plus a plateau-derived default depth (G7) - exact expected richness
    (see compute.p04_rarefaction.expected_richness), not Monte Carlo, and
    each curve's points are spaced across that SAMPLE's own depth (not a
    shared grid pinned to the cohort's max), so low-depth samples still get
    a legible curve instead of one or two points.
    """
    session = _require_session(sid)
    df = session.count_table
    depths = df.sum(axis=0)
    groups = _sample_group_labels(session)

    samples = []
    for sample_id in df.columns:
        depth = int(depths[sample_id])
        counts = df[sample_id].to_numpy()
        curve_depths = np.linspace(0, depth, n_points).astype(int) if depth > 0 else np.array([0])
        richness = expected_richness_curve(counts, curve_depths)
        samples.append({
            "id": sample_id,
            "group": groups.get(sample_id, "sample"),
            "depth": depth,
            "curve": [[int(d), round(r, 2)] for d, r in zip(curve_depths, richness)],
        })

    suggested_threshold = suggest_plateau_depth(df)
    return {"gate_id": "G7", "samples": samples, "suggested_threshold": suggested_threshold}


# Alpha diversity (Alpha page) - Compute-only, same reasoning as G5/G7 above.


@app.get("/api/session/{sid}/alpha")
def get_alpha_diversity(sid: str, depth: int | None = None, n_iterations: int = 20):
    session = _require_session(sid)
    threshold = session.threshold if depth is None else depth
    rng = np.random.default_rng(0)
    raw = compute_alpha_diversity(session.count_table, threshold, n_iterations, rng)
    groups = _prefix_groups(session.count_table.columns)

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


# Beta diversity (Beta page / G9) - Compute-only, same reasoning as G5/G7
# above. `metric` defaults to session.beta_metric (set via G6) but can be
# overridden per request to preview another metric without committing to it.

_BETA_MATRIX_FNS = {
    "bray": lambda df: bray_curtis_matrix(relative_abundance(df)),
    "jaccard": jaccard_matrix,
    "aitchison": aitchison_matrix,
}


@app.get("/api/session/{sid}/beta")
def get_beta_diversity(sid: str, metric: str | None = None):
    session = _require_session(sid)
    metric = session.beta_metric if metric is None else metric
    if metric not in _BETA_MATRIX_FNS:
        raise HTTPException(status_code=400, detail=f"unknown beta metric: {metric}")

    dist = _BETA_MATRIX_FNS[metric](session.count_table)
    ordination = pcoa_ordination(dist)
    coords = ordination["coords"].iloc[:, :2]
    coords.columns = ["PC1", "PC2"]

    groups = _prefix_groups(dist.index)
    grouping = [next(g for g, ids in groups.items() if sample in ids) for sample in dist.index]
    permanova_result = run_permanova(dist, grouping) if len(groups) == 2 else None

    return {
        "metric": metric,
        "metric_mismatch_warning": check_normalization_metric_mismatch(session.norm_strategy, metric),
        "distance_matrix": dist.round(4).to_dict(orient="index"),
        "pcoa": {
            "coords": coords.round(4).to_dict(orient="index"),
            "proportion_explained": ordination["proportion_explained"].round(4).to_dict(),
        },
        "groups": groups,
        "permanova": permanova_result,
    }
