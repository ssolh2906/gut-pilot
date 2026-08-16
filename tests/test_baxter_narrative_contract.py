"""Deterministic coverage for the prose contracts normally graded by an LLM.

These checks do not pretend to replace the adversarial judge. They ensure the
required scientific facts cannot silently disappear when that optional judge
is unavailable overnight.
"""

import sys
from pathlib import Path


SERVER = Path(__file__).resolve().parents[1] / "app" / "server"
sys.path.insert(0, str(SERVER))

from run_pipeline import build_run  # noqa: E402


def test_baxter_qualitative_contracts_are_explicit():
    run = build_run(alpha_iterations=5)

    dropped = run["study_design"]["drop_rationale"].lower()
    assert all(term in dropped for term in ("noncrc", "adenoma", "healthy", "duvallet"))

    batch = run["study_design"]["batch_gate_note"].lower()
    assert "no shared batch" in batch
    assert "randomized" in batch and "three sequencing runs" in batch
    assert "not treated as a computed batch check" in batch

    normalization = run["normalization"]["gate_note"].lower()
    assert "baxter" in normalization and "10,000" in normalization
    assert "duvallet" in normalization and "relative abundance" in normalization

    expectation = run["alpha_diversity"]["expectation_check_text"].lower()
    assert "shannon diversity is flat" in expectation
    assert "richness is significantly higher in crc" in expectation
    assert "taxon-specific enrichment" in expectation

    summary = run["synthesis"]["summary_text"].lower()
    assert "shannon is flat" in summary and "richness is higher" in summary
    assert "jaccard community separation" in summary
    assert "oral-associated" in summary and "differential-abundance" in summary

    validation = run["synthesis"]["literature_validation_text"].lower()
    for genus in ("fusobacterium", "porphyromonas", "peptostreptococcus", "parvimonas"):
        assert genus in validation
    assert "replications" in validation and "not novel" in validation

    for next_step in run["synthesis"]["next_steps"]:
        assert next_step["hypothesis"]
        assert next_step["experiment"]
        assert next_step["uses_data_this_repo_has"] is True

    limitations = " ".join(run["synthesis"]["limitations"]).lower()
    assert "species" in limitations and "strain" in limitations
    assert "caus" in limitations and "cross-sectional" in limitations
    assert "depth" in limitations and "confound" in limitations
