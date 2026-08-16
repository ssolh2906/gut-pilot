"""FastAPI app - the HTTP surface the frontend talks to.

G6 (normalization) and G4 (taxonomic rank) are wired end-to-end through all
three layers (Compute -> Reasoning -> Evidence), running on the real
crc_baxter dataset by default. See docs/gates.md for the full gate contract
this is built against.
"""

import math
import re
from pathlib import Path

import numpy as np
import pandas as pd
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
from compute.p07_differential_abundance import build_da_result, n_tested_by_preset
from reasoning.chatbot import chat_session
from reasoning.g4_taxonomic_rank import apply_g4_rank, build_g4_response
from reasoning.g6_normalization import apply_g6_strategy, build_g6_response
from reasoning.g8_alpha_diversity import build_g8_response
from reasoning.g9_beta_diversity import build_g9_response
from reasoning.g10_differential_abundance import build_g10_response
from reasoning.g_synthesis import build_synthesis_response
from reasoning.study_design import build_study_design_response
from session_store import create_session, get_session

app = FastAPI(title="Gut Pilot Reviewer API")

_REPO_ROOT = Path(__file__).resolve().parents[2]
_KNOWN_TAXA_CSV = _REPO_ROOT / "research" / "fixtures" / "known_taxa_crc.csv"

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


_NON_PREFIX_RE = re.compile(r"^non", re.IGNORECASE)


def _two_group_assignment(session) -> tuple[dict[str, list[str]], tuple[str, str] | None]:
    """Best-effort two-group split for real group-comparison statistics
    (alpha/beta group tests, differential abundance) - independent of G1's
    own reasoning-layer column/level choice in study_design.py, this just
    needs SOME defensible two real groups to run a two-sample test against.

    Built on _sample_group_labels below (handles both real metadata and the
    fixture's "H-01"-style id-prefix convention). When that column has more
    than two levels (e.g. crc_baxter's H/CRC/nonCRC), takes the two largest,
    excluding any level named like "non-X" if doing so still leaves >=2
    groups - a generic stand-in for the field convention
    research/02_study_design.md documents ("only the healthy patients were
    used as controls") without hardcoding any dataset's specific level names.

    Output: ({label: [sample_id, ...]} restricted to exactly the two chosen
    labels, (label_a, label_b) sorted alphabetically) - or ({}, None) if
    fewer than two groups exist at all (single-cohort / no metadata).
    """
    labels_by_sample = _sample_group_labels(session)
    counts: dict[str, int] = {}
    for label in labels_by_sample.values():
        counts[label] = counts.get(label, 0) + 1
    if len(counts) < 2:
        return {}, None

    candidates = counts
    non_excluded = {g: n for g, n in counts.items() if not _NON_PREFIX_RE.match(g)}
    if len(non_excluded) >= 2:
        candidates = non_excluded
    label_a, label_b = sorted(sorted(candidates, key=lambda g: -candidates[g])[:2])

    groups: dict[str, list[str]] = {label_a: [], label_b: []}
    for sample_id, label in labels_by_sample.items():
        if label in groups:
            groups[label].append(sample_id)
    return groups, (label_a, label_b)


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
    # The frontend's own current reducer state (design/betaMetric/alphaLevel/
    # correction) - several gates have no backend apply_*/POST endpoint yet,
    # so this is how the chatbot learns what's actually on the user's screen
    # rather than answering from stale/absent backend state. See
    # reasoning/chatbot.py's _client_state_block.
    client_state: dict | None = None


@app.post("/api/session/{sid}/chat")
def post_chat(sid: str, body: ChatBody):
    session = _require_session(sid)
    return chat_session(session, body.message, page=body.page, client_state=body.client_state)


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
    groups, _labels = _two_group_assignment(session)

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

    groups, _labels = _two_group_assignment(session)
    permanova_result = None
    if len(groups) == 2:
        member_ids = [s for ids in groups.values() for s in ids]
        sub_dist = dist.loc[member_ids, member_ids]
        grouping = [next(g for g, ids in groups.items() if sample in ids) for sample in sub_dist.index]
        permanova_result = run_permanova(sub_dist, grouping)

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


# Differential abundance (Differential page / G10). Runs on the RAW,
# un-rarefied count table per research/07_differential_abundance.md's own
# hard guardrail ("never run DA on the rarefied diversity table merely
# because Step 4 used rarefaction") - independent of session.threshold, and
# restricted to the two-group comparison (real metadata, nonCRC-style third
# arms excluded) via _two_group_assignment.


def _known_taxa_table() -> pd.DataFrame:
    return pd.read_csv(_KNOWN_TAXA_CSV)


@app.get("/api/session/{sid}/da/prevalence")
def get_da_prevalence(sid: str):
    session = _require_session(sid)
    groups, labels = _two_group_assignment(session)
    if labels is None:
        raise HTTPException(status_code=400, detail="need at least two real groups to run differential abundance")
    member_ids = [s for ids in groups.values() for s in ids]
    prevalence_options = n_tested_by_preset(session.count_table[member_ids])
    group_summary = {g: len(ids) for g, ids in groups.items()}
    return build_g10_response(prevalence_options, group_summary)


@app.get("/api/session/{sid}/da/results")
def get_da_results(sid: str, threshold: float = 0.10, correction: str = "bh", alpha: float = 0.05):
    session = _require_session(sid)
    groups, labels = _two_group_assignment(session)
    if labels is None:
        raise HTTPException(status_code=400, detail="need at least two real groups to run differential abundance")

    grouping = [
        next(g for g, ids in groups.items() if sample in ids)
        for sample in session.count_table.columns
        if any(sample in ids for ids in groups.values())
    ]
    member_ids = [s for s in session.count_table.columns if any(s in ids for ids in groups.values())]
    df = session.count_table[member_ids]

    result = build_da_result(df, grouping, labels, threshold, correction, alpha, _known_taxa_table())
    result["group_counts"] = {g: len(ids) for g, ids in groups.items()}
    return result


# Scientific synthesis (Summary page) - no gate ID, this page interprets and
# proposes, it does not decide. Recomputes real alpha/beta/DA results fresh
# (reusing the same Compute functions the Alpha/Beta/Differential pages call)
# so the synthesis is grounded in real numbers regardless of what a given
# page's own UI currently renders.


@app.get("/api/session/{sid}/synthesis")
def get_synthesis(sid: str):
    session = _require_session(sid)
    groups, labels = _two_group_assignment(session)
    if labels is None:
        raise HTTPException(status_code=400, detail="need at least two real groups to synthesize a comparison")
    label_a, label_b = labels

    depths = session.count_table.sum(axis=0).to_dict()
    retention = samples_above_depth(depths, session.threshold)

    rng = np.random.default_rng(0)
    alpha_raw = compute_alpha_diversity(session.count_table, session.threshold, 20, rng)
    alpha_tests = {}
    for metric in alpha_raw.index:
        values_by_group = {g: alpha_raw.loc[metric, ids].dropna().tolist() for g, ids in groups.items()}
        if all(values_by_group.values()):
            alpha_tests[metric] = alpha_group_test(values_by_group)

    beta_metric = session.beta_metric
    dist = _BETA_MATRIX_FNS[beta_metric](session.count_table)
    member_ids = [s for ids in groups.values() for s in ids]
    sub_dist = dist.loc[member_ids, member_ids]
    grouping = [next(g for g, ids in groups.items() if sample in ids) for sample in sub_dist.index]
    permanova = run_permanova(sub_dist, grouping)

    da_grouping = [next(g for g, ids in groups.items() if sample in ids) for sample in member_ids]
    da = build_da_result(
        session.count_table[member_ids], da_grouping, labels, 0.10, "bh", 0.05, _known_taxa_table()
    )
    top_hits = sorted(
        (g for g in da["genera"].values() if g["significant"]),
        key=lambda g: g["q"],
    )[:8]

    context = {
        "group_labels": [label_a, label_b],
        "group_counts": {g: len(ids) for g, ids in groups.items()},
        "normalization_strategy": session.norm_strategy,
        "rarefaction_depth": session.threshold,
        "samples_retained": len(retention["retained"]),
        "samples_excluded_for_depth": len(retention["excluded"]),
        "taxonomic_rank": session.rank,
        "alpha_diversity_tests": alpha_tests,
        "beta_diversity": {"metric": beta_metric, "permanova": permanova},
        "differential_abundance": {
            "method": "CLR normalization + Wilcoxon rank-sum - a SINGLE method, not a multi-method consensus panel (ANCOM-BC2/ALDEx2 are R-only and unavailable in this pipeline)",
            "n_tested": da["n_tested"], "n_total": da["n_total"], "n_significant": da["n_significant"],
            "prevalence_threshold": 0.10, "top_hits": top_hits,
        },
        "known_taxa_literature_crosscheck": da["known_taxa"],
        "other_datasets_available_in_this_project": [
            {
                "id": "cdi_schubert", "condition": "C. difficile infection (unrelated to CRC)",
                "note": "A second real 16S cohort bundled in this project - not a CRC replication cohort, but useful as a specificity check (e.g. whether a hit here is CRC-specific or a generic dysbiosis marker) rather than a wet-lab-only follow-up.",
            }
        ],
    }
    return build_synthesis_response(context)
