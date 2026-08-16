"""End-to-end API smoke tests for the hackathon's Baxter demo path."""

import io
import sys
import tarfile
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "app" / "server"
sys.path.insert(0, str(SERVER))

from main import app  # noqa: E402
import session_store  # noqa: E402
from compute.fixtures import make_fixture_count_table  # noqa: E402
from compute.ingestion import load_dataset  # noqa: E402


def test_invalid_upload_is_a_clean_client_error():
    response = TestClient(app).post(
        "/api/session",
        files={"count_table": ("broken.tar.gz", io.BytesIO(b"not a gzip tarball"), "application/gzip")},
    )
    assert response.status_code == 400
    assert "could not parse uploaded file" in response.json()["detail"]


def test_valid_baxter_counts_are_compacted_without_changing_depths():
    loaded = load_dataset("crc_baxter")
    assert loaded.raw_counts.values.dtype.name == "uint32"
    assert loaded.raw_counts.values.dtype.itemsize == 4
    assert int(loaded.raw_counts.sum(axis=0).max()) == 258713
    assert loaded.parse_report["count_range"] == {"min": 0, "max": 35797}


def test_scientific_hard_stop_does_not_create_a_session():
    otu = (ROOT / "tests/eval/fixtures/data_quality/otu_table.duplicate_id_and_noninteger.tsv").read_bytes()
    metadata = (ROOT / "tests/eval/fixtures/data_quality/metadata.duplicate_id_and_noninteger.txt").read_bytes()
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w:gz") as tf:
        for name, payload in (
            ("invalid/RDP/invalid.rdp_assigned", otu),
            ("invalid/invalid.metadata.txt", metadata),
        ):
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            tf.addfile(info, io.BytesIO(payload))
    archive.seek(0)

    session_store._sessions.clear()
    response = TestClient(app).post(
        "/api/session",
        files={"count_table": ("invalid.tar.gz", archive, "application/gzip")},
    )
    assert response.status_code == 422
    assert "non-integer values" in response.json()["detail"]
    assert session_store.session_stats()["active"] == 0


def test_uploaded_baxter_archive_reaches_every_compute_stage(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    archive = ROOT / "data" / "MicrobiomeHD" / "crc_baxter_results.tar.gz"
    client = TestClient(app)

    with archive.open("rb") as handle:
        response = client.post(
            "/api/session",
            files={"count_table": (archive.name, handle, "application/gzip")},
        )
    assert response.status_code == 200
    session = response.json()
    assert session["n_samples"] == 490
    assert session["recommended_depth"] == 2100
    assert session["parse_report"]["status"] == "PASS"
    sid = session["session_id"]

    alpha = client.get(f"/api/session/{sid}/alpha/diversity?n_iterations=5").json()
    assert alpha["comparison_groups"] == ["H", "CRC"]
    assert alpha["depth"] == 2100
    assert alpha["significance"]["Shannon"]["p_value"] > 0.5
    assert alpha["significance"]["Observed_taxa"]["p_value"] < 0.01

    beta = client.get(f"/api/session/{sid}/beta/diversity?metric=jaccard").json()
    assert beta["permanova"]["p"] <= 0.05
    assert len(beta["points"]) == 264
    assert "Five rarefaction distance matrices" in beta["analysis_note"]

    da = client.get(f"/api/session/{sid}/differential-abundance?prevalence=0.10").json()
    assert da["core_signature_recovered"] == [
        "Fusobacterium",
        "Parvimonas",
        "Peptostreptococcus",
        "Porphyromonas",
    ]
    synthesis = client.get(
        f"/api/session/{sid}/synthesis?n_iterations=5&metric=jaccard&prevalence=0.10"
    )
    assert synthesis.status_code == 200
    synthesis = synthesis.json()
    assert synthesis["reasoning_source"] == "data_grounded_fallback"
    assert "Baxter" not in synthesis["hero_title"] + synthesis["hero_statement"]
    assert [finding["label"] for finding in synthesis["findings"]] == [
        "Within-sample diversity",
        "Community composition",
        "Taxon-specific signal",
    ]
    assert len(synthesis["literature_context"]) >= 3
    assert len(synthesis["hypotheses"]) >= 1
    assert all(reference["paper_id"].startswith("PMC") for reference in synthesis["references"])
    assert client.delete(f"/api/session/{sid}").json()["status"] == "deleted"


def test_reasoning_gates_degrade_to_data_grounded_answers_without_keys(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = TestClient(app)
    session = client.post("/api/session?dataset=crc_baxter").json()
    sid = session["session_id"]

    design = client.get(f"/api/session/{sid}/design/study-design")
    rank = client.get(f"/api/session/{sid}/design/rank")
    normalization = client.get(f"/api/session/{sid}/normalize/strategy")
    chat = client.post(
        f"/api/session/{sid}/chat",
        json={"message": "What is the current analysis state?", "page": "alpha"},
    )

    for response in (design, rank, normalization, chat):
        assert response.status_code == 200
        assert response.json()["reasoning_source"] == "data_grounded_fallback"
    assert normalization.json()["options"][0]["retention_preview"]["total"] == 292


def test_threshold_change_recomputes_at_the_selected_depth():
    client = TestClient(app)
    sid = client.post("/api/session?dataset=crc_baxter").json()["session_id"]
    changed = client.post(
        f"/api/session/{sid}/rarefaction/depth", json={"depth": 3000}
    )
    assert changed.status_code == 200
    assert changed.json()["depth"] == 3000
    alpha = client.get(f"/api/session/{sid}/alpha/diversity?n_iterations=2").json()
    assert alpha["depth"] == 3000
    assert f"alpha:3000:bh:2" in session_store.get_session(sid).analysis_cache


def test_in_memory_sessions_are_bounded():
    session_store._sessions.clear()
    created = [session_store.create_session(make_fixture_count_table()) for _ in range(4)]
    assert len(session_store._sessions) == 3
    assert created[0].id not in session_store._sessions
    assert created[-1].id in session_store._sessions
    session_store._sessions.clear()


def test_health_reports_claude_primary_and_openai_fallback_readiness(monkeypatch):
    monkeypatch.delenv("GUT_PILOT_LLM_PROVIDER", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("GUT_PILOT_LLM_FALLBACK", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-placeholder")

    payload = TestClient(app).get("/api/health").json()
    assert payload["reasoning_provider"] == "anthropic"
    assert payload["provider_credential_ready"] is False
    assert payload["fallback_provider"] == "openai"
    assert payload["fallback_credential_ready"] is True
    assert isinstance(payload["paperclip_cli_ready"], bool)
    assert payload["demo_fallback_ready"] is True
