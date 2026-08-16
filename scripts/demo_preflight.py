"""Exercise the exact Gut Pilot Baxter demo path against running services."""

from __future__ import annotations

import argparse
from pathlib import Path
from time import perf_counter

import httpx


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARCHIVE = ROOT / "data" / "MicrobiomeHD" / "crc_baxter_results.tar.gz"
CORE_GENERA = ["Fusobacterium", "Parvimonas", "Peptostreptococcus", "Porphyromonas"]


def timed(client: httpx.Client, timings: dict[str, float], label: str, method: str, url: str, **kwargs):
    started = perf_counter()
    response = client.request(method, url, **kwargs)
    timings[label] = perf_counter() - started
    response.raise_for_status()
    return response


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def run_preflight(base_url: str, archive: Path) -> dict:
    base = base_url.rstrip("/")
    frontend = base.removesuffix("/api")
    timings: dict[str, float] = {}
    sid = None
    sessions_before = None

    with httpx.Client(timeout=180) as client:
        health = timed(client, timings, "health", "GET", f"{base}/health").json()
        require(health.get("status") == "ok", "API health did not report status=ok")
        require(health.get("demo_fallback_ready") is True, "demo fallback is not ready")
        sessions_before = health["sessions"]["active"]
        timed(client, timings, "frontend", "GET", f"{frontend}/")

        try:
            with archive.open("rb") as handle:
                session = timed(
                    client,
                    timings,
                    "upload",
                    "POST",
                    f"{base}/session",
                    files={"count_table": (archive.name, handle, "application/gzip")},
                ).json()
            sid = session["session_id"]
            prefix = f"{base}/session/{sid}"

            design = timed(client, timings, "study_design", "GET", f"{prefix}/design/study-design").json()
            rank = timed(client, timings, "rank", "GET", f"{prefix}/design/rank").json()
            timed(client, timings, "qc", "GET", f"{prefix}/qc/depth")
            normalization = timed(client, timings, "normalization", "GET", f"{prefix}/normalize/strategy").json()
            timed(
                client, timings, "confirm_normalization", "POST", f"{prefix}/normalize/strategy",
                json={"strategy": normalization["recommendation"]["option_id"]},
            )
            timed(
                client, timings, "confirm_depth", "POST", f"{prefix}/rarefaction/depth",
                json={"depth": session["recommended_depth"]},
            )
            alpha = timed(
                client, timings, "alpha", "GET",
                f"{prefix}/alpha/diversity?correction=bh&n_iterations=50",
            ).json()
            beta = timed(
                client, timings, "beta", "GET", f"{prefix}/beta/diversity?metric=jaccard",
            ).json()
            da = timed(
                client, timings, "differential", "GET",
                f"{prefix}/differential-abundance?prevalence=0.10",
            ).json()

            # The summary page requests these exact URLs again; they should be cached.
            timed(
                client, timings, "summary_alpha_cached", "GET",
                f"{prefix}/alpha/diversity?correction=bh&n_iterations=50",
            )
            timed(client, timings, "summary_beta_cached", "GET", f"{prefix}/beta/diversity?metric=jaccard")
            timed(
                client, timings, "summary_da_cached", "GET",
                f"{prefix}/differential-abundance?prevalence=0.10",
            )

            require(session["n_samples"] == 490, "Baxter upload did not contain 490 samples")
            require(session["recommended_depth"] == 2100, "data-driven depth was not 2,100")
            require(session["parse_report"]["status"] == "PASS", "ingestion did not pass")
            require(design["g1"]["selected_column"] == "DiseaseState", "DiseaseState was not selected")
            require(rank["recommendation"]["option_id"] == "genus", "genus was not recommended")
            require(alpha["significance"]["Shannon"]["p_value"] > 0.5, "Shannon result changed")
            require(alpha["significance"]["Observed_taxa"]["p_value"] < 0.01, "richness result changed")
            require(beta["permanova"]["p"] <= 0.05, "Jaccard PERMANOVA is no longer significant")
            require(len(beta["points"]) == 264, "Jaccard retained-sample count changed")
            require(da["core_signature_recovered"] == CORE_GENERA, "Baxter core signature changed")
        finally:
            if sid is not None:
                timed(client, timings, "cleanup", "DELETE", f"{base}/session/{sid}")

        health_after = timed(client, timings, "health_after", "GET", f"{base}/health").json()
        require(
            health_after["sessions"]["active"] == sessions_before,
            "preflight leaked an in-memory analysis session",
        )

    return {
        "timings": timings,
        "alpha": alpha,
        "beta": beta,
        "differential": da,
        "reasoning_sources": [
            design["reasoning_source"], rank["reasoning_source"], normalization["reasoning_source"],
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:5173/api")
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    args = parser.parse_args()

    if not args.archive.is_file():
        parser.error(f"archive not found: {args.archive}")

    started = perf_counter()
    result = run_preflight(args.base_url, args.archive)
    alpha = result["alpha"]
    beta = result["beta"]
    da = result["differential"]
    print("PASS — live Baxter demo path")
    print(
        f"science: Shannon p={alpha['significance']['Shannon']['p_value']:.3g}; "
        f"richness p={alpha['significance']['Observed_taxa']['p_value']:.3g}; "
        f"Jaccard p={beta['permanova']['p']:.3g}, R²={beta['permanova']['r2']:.3g}; "
        f"core={len(da['core_signature_recovered'])}/4"
    )
    print("reasoning: " + ", ".join(result["reasoning_sources"]))
    print("timings: " + ", ".join(f"{key}={value:.2f}s" for key, value in result["timings"].items()))
    print(f"total={perf_counter() - started:.2f}s; sessions cleaned up")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
