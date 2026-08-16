"""In-memory session state - one run of the pipeline, keyed by session id.

Deliberately not a database: this is scaffolding for local development, the
same role src/state/store.js plays on the frontend. Swap for a real store
(Redis, Postgres) when sessions need to survive a server restart or be
shared across processes.
"""

import uuid
from dataclasses import dataclass, field

import pandas as pd


@dataclass
class Session:
    id: str
    count_table: pd.DataFrame  # index=<rank>, columns=sample_id — the CURRENTLY rank-collapsed
    # table, mutated by G4 (apply_g4_rank); consumed by G6/downstream.
    raw_counts: pd.DataFrame | None = None  # per-OTU raw counts, pre-collapse (None on the
    # synthetic-fixture path, which has no real per-OTU/taxonomy data behind it)
    taxonomy_map: dict | None = None  # feature_id -> {"phylum":..., ..., "genus":...}
    metadata: pd.DataFrame | None = None  # real sample metadata, indexed by sample_id (None on fixture path)
    parse_report: dict | None = None  # ingestion's parse_report (None on fixture path)
    rank: str = "genus"  # G4's current choice: "phylum" | "family" | "genus"
    floor_depth: int = 5000
    threshold: int = 4200  # rarefaction depth (G7)
    norm_strategy: str = "rarefy"  # "rarefy" | "css" | "clr"
    beta_metric: str = "bray"  # "bray" | "jaccard" | "aitchison"
    log: list = field(default_factory=list)
    chat_history: list = field(default_factory=list)  # [{"role": "user"|"assistant", "text": str}]


_sessions: dict[str, Session] = {}


def create_session(
    count_table: pd.DataFrame,
    *,
    raw_counts: pd.DataFrame | None = None,
    taxonomy_map: dict | None = None,
    metadata: pd.DataFrame | None = None,
    parse_report: dict | None = None,
) -> Session:
    sid = uuid.uuid4().hex[:12]
    session = Session(
        id=sid,
        count_table=count_table,
        raw_counts=raw_counts,
        taxonomy_map=taxonomy_map,
        metadata=metadata,
        parse_report=parse_report,
    )
    _sessions[sid] = session
    return session


def get_session(sid: str) -> Session:
    return _sessions[sid]
