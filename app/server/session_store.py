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
    count_table: pd.DataFrame  # index=genus, columns=sample_id
    floor_depth: int = 5000
    threshold: int = 4200  # rarefaction depth (G7)
    norm_strategy: str = "rarefy"  # "rarefy" | "css" | "clr"
    beta_metric: str = "bray"  # "bray" | "jaccard" | "aitchison"
    log: list = field(default_factory=list)


_sessions: dict[str, Session] = {}


def create_session(count_table: pd.DataFrame) -> Session:
    sid = uuid.uuid4().hex[:12]
    session = Session(id=sid, count_table=count_table)
    _sessions[sid] = session
    return session


def get_session(sid: str) -> Session:
    return _sessions[sid]
