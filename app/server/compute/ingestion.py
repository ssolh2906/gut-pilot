"""Ingestion (Step 1 — Upload). No human-decision gate here (research/01_ingestion.md:
`gate_ids: []`) — this is a data-contract/provenance check, not a scientific
decision, so it's Compute only: no Claude call.

Deliberately does NOT collapse to genus (or any rank) here — that's deferred
to G4 (compute.p02_taxonomy.aggregate_by_rank), per 01_ingestion.md's own
rule. `raw_counts` stays feature-ID-indexed (full RDP lineage string per row,
including its trailing d__denovoN bookkeeping suffix) so two OTUs that share
a lineage but differ only by that suffix are never silently merged here.
"""

import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from .p01_metadata import load_metadata
from .p02_taxonomy import parse_lineage

_REPO_ROOT = Path(__file__).resolve().parents[3]
# Bundled MicrobiomeHD tarballs live in data/MicrobiomeHD/ (see data/dataset_info.yaml),
# not data/raw_data/ (which is an empty placeholder dir) -- load_dataset() would
# FileNotFoundError on every call otherwise, since nothing ever populates raw_data/.
_RAW_DATA_DIR = _REPO_ROOT / "data" / "MicrobiomeHD"
_EXTRACTED_DIR = _RAW_DATA_DIR / "_extracted"
_UPLOADS_DIR = _REPO_ROOT / "data" / "raw_data" / "_uploads"

_RANK_ORDER = ["phylum", "class", "order", "family", "genus"]

_DATASET_LAYOUTS = {
    "crc_baxter": {
        "tarball": "crc_baxter_results.tar.gz",
        "otu_table": "crc_baxter_results/RDP/crc_baxter.otu_table.100.denovo.rdp_assigned",
        "metadata": "crc_baxter_results/crc_baxter.metadata.txt",
    },
}


@dataclass
class IngestionResult:
    raw_counts: pd.DataFrame  # index=full taxonomy lineage string, columns=sample_id, raw int counts
    taxonomy_map: dict  # feature_id -> {"phylum":..., "class":..., ..., "genus":...}
    metadata: pd.DataFrame  # indexed by sample_id (str)
    parse_report: dict


def extract_tarball(tarball_path: Path, dest_dir: Path) -> Path:
    """Idempotent extraction. Returns the extracted dataset's root directory."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tarball_path) as tf:
        top = tf.getnames()[0].split("/")[0]
        root = dest_dir / top
        if not root.exists():
            tf.extractall(dest_dir)
    return root


def parse_otu_table(path: Path) -> pd.DataFrame:
    """Raw per-OTU integer counts, feature_id = full lineage string. Not
    collapsed to any rank here."""
    return pd.read_csv(path, sep="\t", index_col=0)


def extract_uploaded_tarball(file_obj, dest_dir: Path | None = None) -> Path:
    """Extract a user-uploaded MicrobiomeHD-format tarball (.tar.gz - same
    format as the bundled crc_baxter/cdi_schubert datasets) to a scratch
    directory and return its root folder. Each upload gets its own
    subdirectory, named from the tarball's own top-level folder, so repeat
    uploads of the same or different datasets don't collide.
    """
    dest_dir = dest_dir or _UPLOADS_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_obj.seek(0)
    try:
        with tarfile.open(fileobj=file_obj, mode="r:gz") as tf:
            names = [name for name in tf.getnames() if name.strip("/")]
            if not names:
                raise ValueError("uploaded tarball is empty")
            top = names[0].split("/")[0]
            root = dest_dir / top
            # Python's data filter rejects absolute paths, traversal, unsafe
            # links, and special files before anything is written.
            tf.extractall(dest_dir, filter="data")
    except (tarfile.TarError, OSError) as exc:
        raise ValueError(f"uploaded file is not a safe gzip tar archive: {exc}") from exc
    return root


def _discover_layout(root: Path) -> dict:
    """Find the RDP-assigned OTU table and metadata file inside an extracted
    MicrobiomeHD-format folder, without assuming an exact base filename
    (an uploaded dataset won't be named "crc_baxter")."""
    otu_candidates = sorted(root.glob("RDP/*.rdp_assigned"))
    if not otu_candidates:
        raise ValueError(
            "could not find an RDP-assigned OTU table (expected RDP/*.rdp_assigned) inside the uploaded tarball"
        )
    metadata_candidates = sorted(root.glob("*.metadata.txt"))
    if not metadata_candidates:
        raise ValueError(
            "could not find a metadata file (expected <name>.metadata.txt) inside the uploaded tarball"
        )
    return {"otu_table": otu_candidates[0], "metadata": metadata_candidates[0]}


def check_trailing_total(df: pd.DataFrame) -> dict:
    """Whether the last column looks like a per-row total column.

    Returns {"found": bool, "reconciles": bool | None} - "reconciles" is None
    when no such column was found, so callers don't confuse "no total column"
    with "total column present but wrong."
    """
    last_col = df.columns[-1]
    if str(last_col).strip().lower() != "total":
        return {"found": False, "reconciles": None}
    row_sums = df.drop(columns=last_col).sum(axis=1)
    return {"found": True, "reconciles": bool((df[last_col] == row_sums).all())}


def _strip_trailing_total(raw_counts: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """If the last column is a reconciling row-total column, drop it and
    report what happened — matches the Upload page's own promise ("An
    optional trailing total column is dropped on load"). A non-reconciling
    "total" column is left in place and surfaced as a hard_stop instead
    (build_parse_report), since silently dropping a total that doesn't
    actually match the row sums could mask a real data problem.
    """
    info = check_trailing_total(raw_counts)
    if info["found"] and info["reconciles"]:
        raw_counts = raw_counts.drop(columns=raw_counts.columns[-1])
    return raw_counts, info


def validate_counts(df: pd.DataFrame) -> list[str]:
    """Hard-stop-worthy count validity issues. Empty list means the table is clean."""
    problems = []
    # Avoid materializing a second float64 copy of a large, already-integer
    # OTU table. Mixed/non-integer inputs still coerce to a floating array so
    # the same validation rules apply to malformed uploads.
    values = df.to_numpy(copy=False)
    if not np.issubdtype(values.dtype, np.number):
        try:
            values = df.to_numpy(dtype=float)
        except (TypeError, ValueError):
            return ["count table contains non-numeric values"]
    if not np.isfinite(values).all():
        problems.append("count table contains missing or non-finite (NaN/inf) values")
    if (values < 0).any():
        problems.append("count table contains negative values")
    if np.issubdtype(values.dtype, np.floating) and not np.array_equal(values, np.round(values)):
        problems.append("count table contains non-integer values")
    return problems


def _compact_valid_counts(raw_counts: pd.DataFrame) -> pd.DataFrame:
    """Use a lossless unsigned dtype sized for any within-sample aggregation."""
    max_depth = int(raw_counts.sum(axis=0).max())
    if max_depth <= np.iinfo(np.uint16).max:
        dtype = np.uint16
    elif max_depth <= np.iinfo(np.uint32).max:
        dtype = np.uint32
    else:
        dtype = np.uint64
    return raw_counts.astype(dtype, copy=False)


def reconcile_metadata(count_columns, metadata: pd.DataFrame) -> dict:
    """Exact unmatched-ID sets both directions. No fuzzy/case-insensitive
    matching here — that's reported separately as a warning, never silently
    applied, per 01_ingestion.md's "never silently fuzzy-match" rule.
    """
    count_ids = {str(c) for c in count_columns}
    meta_ids = {str(m) for m in metadata.index}
    count_only = sorted(count_ids - meta_ids)
    meta_only = sorted(meta_ids - count_ids)
    return {
        "matched_samples": len(count_ids & meta_ids),
        "unmatched_count_table_ids": count_only,
        "unmatched_metadata_ids": meta_only,
    }


def _probable_formatting_mismatches(count_only: list[str], meta_only: list[str]) -> list[dict]:
    """Case/whitespace-only mismatches between the two unmatched-ID sets —
    reported as a warning for a human to resolve, never auto-merged."""
    meta_only_lower = {m.strip().lower(): m for m in meta_only}
    return [
        {"count_table_id": c, "metadata_id": meta_only_lower[key]}
        for c in count_only
        if (key := c.strip().lower()) in meta_only_lower
    ]


def _deepest_rank_observed(taxonomy_map: dict) -> str | None:
    deepest = None
    for ranks in taxonomy_map.values():
        for rank in reversed(_RANK_ORDER):
            if rank in ranks:
                if deepest is None or _RANK_ORDER.index(rank) > _RANK_ORDER.index(deepest):
                    deepest = rank
                break
    return deepest


def build_parse_report(raw_counts: pd.DataFrame, taxonomy_map: dict, metadata: pd.DataFrame, trailing_total: dict) -> dict:
    count_problems = validate_counts(raw_counts)
    reconciliation = reconcile_metadata(raw_counts.columns, metadata)
    formatting_mismatches = _probable_formatting_mismatches(
        reconciliation["unmatched_count_table_ids"], reconciliation["unmatched_metadata_ids"]
    )

    hard_stops = list(count_problems)
    if trailing_total["found"] and not trailing_total["reconciles"]:
        hard_stops.append("trailing 'total' column does not reconcile with row sums")
    if reconciliation["unmatched_count_table_ids"]:
        hard_stops.append(
            f"{len(reconciliation['unmatched_count_table_ids'])} count-table sample IDs have no metadata match"
        )

    depths = raw_counts.sum(axis=0)
    n_unassigned = sum(1 for ranks in taxonomy_map.values() if "genus" not in ranks)
    orientation_warning = (
        "row count is smaller than column count — verify this table has features as rows and "
        "samples as columns (not transposed)"
        if raw_counts.shape[0] < raw_counts.shape[1] else None
    )

    warnings = []
    if formatting_mismatches:
        warnings.append("possible case/whitespace-only ID mismatches found")
    if orientation_warning:
        warnings.append(orientation_warning)

    return {
        "status": "HARD_STOP" if hard_stops else "PASS",
        "table_orientation": "features_as_rows",
        "n_samples": int(raw_counts.shape[1]),
        "n_features": int(raw_counts.shape[0]),
        "count_type": "integer" if not count_problems else "invalid",
        "count_range": {"min": int(raw_counts.to_numpy().min()), "max": int(raw_counts.to_numpy().max())},
        "library_depth_range": {"min": int(depths.min()), "max": int(depths.max())},
        "taxonomy": {
            "detected": True,
            "format": "RDP lineage string (k__/p__/c__/o__/f__/g__/s__, trailing d__denovoN is a bookkeeping ID, not a rank)",
            "deepest_rank_observed": _deepest_rank_observed(taxonomy_map),
            "n_unique_feature_ids": int(raw_counts.index.nunique()),
            "n_repeated_taxonomy_labels": int(len(raw_counts.index) - raw_counts.index.nunique()),
            "n_otus_unassigned_at_genus": n_unassigned,
        },
        "metadata": {
            "supplied": True,
            "n_rows": int(metadata.shape[0]),
            **reconciliation,
            "probable_formatting_mismatches": formatting_mismatches,
        },
        "transformations": [] if not trailing_total["found"] else ["removed reconciling 'total' column"],
        "warnings": warnings,
        "hard_stops": hard_stops,
        "trailing_total_column_found": trailing_total["found"],
        "summary": "PASS: table parsed and validated cleanly." if not hard_stops
        else f"HARD_STOP: {len(hard_stops)} issue(s) found, see hard_stops.",
    }


def _load_from_layout(otu_table_path: Path, metadata_path: Path) -> IngestionResult:
    raw_counts = parse_otu_table(otu_table_path)
    raw_counts, trailing_total = _strip_trailing_total(raw_counts)
    metadata = load_metadata(metadata_path)
    metadata.index = metadata.index.astype(str)

    taxonomy_map = {feature_id: parse_lineage(feature_id) for feature_id in raw_counts.index.unique()}
    parse_report = build_parse_report(raw_counts, taxonomy_map, metadata, trailing_total)
    if parse_report["status"] == "PASS":
        raw_counts = _compact_valid_counts(raw_counts)

    return IngestionResult(
        raw_counts=raw_counts, taxonomy_map=taxonomy_map, metadata=metadata, parse_report=parse_report
    )


def load_dataset(dataset_id: str = "crc_baxter") -> IngestionResult:
    """Extract (if needed) and parse one of the bundled MicrobiomeHD datasets."""
    layout = _DATASET_LAYOUTS[dataset_id]
    extract_tarball(_RAW_DATA_DIR / layout["tarball"], _EXTRACTED_DIR)
    return _load_from_layout(_EXTRACTED_DIR / layout["otu_table"], _EXTRACTED_DIR / layout["metadata"])


def load_uploaded_dataset(file_obj) -> IngestionResult:
    """Extract and parse a user-uploaded MicrobiomeHD-format tarball
    (.tar.gz) - the same real-data format as the bundled datasets, just
    uploaded instead of pre-extracted from data/raw_data/. Raises ValueError
    (caller should turn this into a 400, not a 500) if the tarball doesn't
    contain the expected files.
    """
    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    # A unique extraction root prevents two archives with the same internal
    # folder name from silently reusing one another's files. The frames are
    # fully loaded before this context exits, so no upload artifacts remain.
    with tempfile.TemporaryDirectory(prefix="gut-pilot-", dir=_UPLOADS_DIR) as temp_dir:
        root = extract_uploaded_tarball(file_obj, Path(temp_dir))
        layout = _discover_layout(root)
        return _load_from_layout(layout["otu_table"], layout["metadata"])
