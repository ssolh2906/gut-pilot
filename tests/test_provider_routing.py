"""Provider routing tests: Claude remains default; OpenAI is explicit."""

import sys
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

SERVER = Path(__file__).resolve().parents[1] / "app" / "server"
sys.path.insert(0, str(SERVER))

from reasoning import shared  # noqa: E402
from reasoning import g4_taxonomic_rank  # noqa: E402
from session_store import Session  # noqa: E402


def test_claude_remains_the_default(monkeypatch):
    monkeypatch.delenv("GUT_PILOT_LLM_PROVIDER", raising=False)
    assert shared.configured_provider() == "anthropic"


def test_openai_can_be_selected_without_replacing_claude(monkeypatch):
    monkeypatch.setenv("GUT_PILOT_LLM_PROVIDER", "openai")
    monkeypatch.setattr(shared, "_run_openai_tool_loop", lambda *args, **kwargs: "openai")
    monkeypatch.setattr(shared, "_run_anthropic_tool_loop", lambda *args, **kwargs: "anthropic")
    assert shared.run_tool_loop("system", [], tools=[]) == "openai"


def test_openai_failure_can_fall_back_to_claude_when_enabled(monkeypatch):
    monkeypatch.setenv("GUT_PILOT_LLM_PROVIDER", "openai")
    monkeypatch.setenv("GUT_PILOT_LLM_FALLBACK", "anthropic")

    def fail(*args, **kwargs):
        raise RuntimeError("temporary provider failure")

    monkeypatch.setattr(shared, "_run_openai_tool_loop", fail)
    monkeypatch.setattr(shared, "_run_anthropic_tool_loop", lambda *args, **kwargs: "anthropic")
    assert shared.run_tool_loop("system", [], tools=[]) == "anthropic"


def test_claude_failure_can_fall_back_to_openai_for_the_demo(monkeypatch):
    monkeypatch.delenv("GUT_PILOT_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("GUT_PILOT_LLM_FALLBACK", "openai")

    def fail(*args, **kwargs):
        raise RuntimeError("Claude quota unavailable")

    monkeypatch.setattr(shared, "_run_anthropic_tool_loop", fail)
    monkeypatch.setattr(shared, "_run_openai_tool_loop", lambda *args, **kwargs: "openai")
    assert shared.run_tool_loop("system", [], tools=[]) == "openai"


def test_invalid_claude_gate_contract_falls_back_to_openai(monkeypatch):
    monkeypatch.delenv("GUT_PILOT_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("GUT_PILOT_LLM_FALLBACK", "openai")
    calls = []

    def anthropic(*args, **kwargs):
        calls.append("anthropic")
        return '```json\n{"wrong_field": true}\n```'

    def openai(*args, **kwargs):
        calls.append("openai")
        return '```json\n{"recommendation": "rarefy"}\n```'

    monkeypatch.setattr(shared, "_run_anthropic_tool_loop", anthropic)
    monkeypatch.setattr(shared, "_run_openai_tool_loop", openai)

    def validate(payload):
        if payload.get("recommendation") != "rarefy":
            raise ValueError("invalid gate contract")

    assert shared.run_gate_reasoning("system", "choose", validator=validate) == {
        "recommendation": "rarefy"
    }
    assert calls == ["anthropic", "openai"]


def test_invalid_rank_payload_degrades_without_a_server_error(monkeypatch):
    session = Session(
        id="invalid-provider-payload",
        count_table=pd.DataFrame({"S1": [10]}, index=["GenusA"]),
        raw_counts=pd.DataFrame({"S1": [10]}, index=["otu1"]),
        taxonomy_map={
            "otu1": {"phylum": "P", "family": "F", "genus": "GenusA"},
        },
    )
    monkeypatch.setattr(
        g4_taxonomic_rank,
        "_run_reasoning",
        lambda *_: {
            "recommended_rank": "genus",
            "rationale": "The rank itself is valid, but the citation shape is not.",
            "paper_id": "PMC1",
            "quote": ["not", "text"],
            "line_ref": "L1",
        },
    )

    response = g4_taxonomic_rank.build_g4_response(session)

    assert response["reasoning_source"] == "data_grounded_fallback"
    assert response["recommendation"]["option_id"] == "genus"


def test_invalid_or_same_provider_fallback_is_not_replayed(monkeypatch):
    monkeypatch.delenv("GUT_PILOT_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("GUT_PILOT_LLM_FALLBACK", "anthropic")
    calls = []

    def fail(*args, **kwargs):
        calls.append("anthropic")
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(shared, "_run_anthropic_tool_loop", fail)
    try:
        shared.run_tool_loop("system", [], tools=[])
    except RuntimeError:
        pass
    assert calls == ["anthropic"]


def test_openai_responses_tool_loop_executes_existing_paperclip_shape(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-placeholder")
    calls = []
    client_options = {}

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                return SimpleNamespace(
                    output=[SimpleNamespace(
                        type="function_call",
                        name="paperclip_lookup_doi",
                        arguments='{"doi":"10.1000/test"}',
                        call_id="call_1",
                    )],
                    output_text="",
                )
            return SimpleNamespace(output=[], output_text="grounded answer")

    fake_client = SimpleNamespace(responses=FakeResponses())
    def fake_openai(**kwargs):
        client_options.update(kwargs)
        return fake_client

    monkeypatch.setattr(shared, "OpenAI", fake_openai)
    tool = SimpleNamespace(
        name="paperclip_lookup_doi",
        description="Look up a DOI",
        input_schema={"type": "object", "properties": {"doi": {"type": "string"}}, "required": ["doi"]},
        call=lambda payload: f"paper for {payload['doi']}",
    )

    answer = shared._run_openai_tool_loop("system", [{"role": "user", "content": "find it"}], tools=[tool], max_tokens=500)
    assert answer == "grounded answer"
    assert calls[0]["tools"][0]["name"] == "paperclip_lookup_doi"
    assert client_options == {"timeout": 45.0, "max_retries": 0}
    assert calls[1]["input"][-1] == {
        "type": "function_call_output",
        "call_id": "call_1",
        "output": "paper for 10.1000/test",
    }


def test_anthropic_beta_tool_runner_path_matches_installed_sdk(monkeypatch):
    calls = {}

    class FakeRunner:
        def __iter__(self):
            return iter([
                SimpleNamespace(content=[SimpleNamespace(type="text", text="grounded answer")])
            ])

    class FakeMessages:
        def tool_runner(self, **kwargs):
            calls.update(kwargs)
            return FakeRunner()

    client_options = {}

    def fake_anthropic(**kwargs):
        client_options.update(kwargs)
        return SimpleNamespace(beta=SimpleNamespace(messages=FakeMessages()))

    monkeypatch.setattr(shared.anthropic, "Anthropic", fake_anthropic)
    answer = shared._run_anthropic_tool_loop(
        "system",
        [{"role": "user", "content": "interpret"}],
        model="claude-haiku-4-5",
        tools=[],
        max_tokens=500,
    )

    assert answer == "grounded answer"
    assert calls["model"] == "claude-haiku-4-5"
    assert calls["system"] == "system"
    assert client_options == {"timeout": 45.0, "max_retries": 0}


def test_provider_timeout_is_configurable_and_bounded(monkeypatch):
    monkeypatch.setenv("GUT_PILOT_LLM_TIMEOUT_SECONDS", "12.5")
    assert shared.provider_timeout_seconds() == 12.5
    monkeypatch.setenv("GUT_PILOT_LLM_TIMEOUT_SECONDS", "1")
    assert shared.provider_timeout_seconds() == 5.0
    monkeypatch.setenv("GUT_PILOT_LLM_TIMEOUT_SECONDS", "999")
    assert shared.provider_timeout_seconds() == 120.0
    monkeypatch.setenv("GUT_PILOT_LLM_TIMEOUT_SECONDS", "invalid")
    assert shared.provider_timeout_seconds() == shared.DEFAULT_PROVIDER_TIMEOUT_SECONDS
