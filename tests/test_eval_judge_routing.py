"""Qualitative-evaluator provider fallback tests."""

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


EVAL_DIR = Path(__file__).resolve().parent / "eval"
sys.path.insert(0, str(EVAL_DIR))

import judge  # noqa: E402


def test_logged_out_claude_can_fall_through_to_openai(monkeypatch):
    monkeypatch.setattr(judge, "_call_via_cli", lambda *args: (_ for _ in ()).throw(RuntimeError("not logged in")))
    monkeypatch.setattr(judge, "_call_via_http", lambda *args: None)
    monkeypatch.setattr(judge, "_call_via_openai", lambda *args: '{"reasoning":"meets rubric","pass":true}')

    assert judge._call_model("system", "user") == '{"reasoning":"meets rubric","pass":true}'


def test_openai_judge_uses_structured_responses_output(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-placeholder")
    calls = []

    class Parsed:
        def model_dump_json(self, by_alias=False):
            assert by_alias is True
            return '{"reasoning":"specific evidence","pass":true}'

    class Responses:
        def parse(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(output_parsed=Parsed())

    client_options = {}
    def fake_openai(**kwargs):
        client_options.update(kwargs)
        return SimpleNamespace(responses=Responses())

    monkeypatch.setattr(judge, "OpenAI", fake_openai)
    raw = judge._call_via_openai("system", "user", "gpt-5.6")

    assert judge._extract_json(raw)["pass"] is True
    assert calls[0]["model"] == "gpt-5.6"
    assert calls[0]["input"][0]["role"] == "system"
    assert client_options == {"timeout": 45.0, "max_retries": 0}
    schema = calls[0]["text_format"].model_json_schema()
    assert schema["required"] == ["reasoning", "pass"]
    assert schema["additionalProperties"] is False


def test_no_authenticated_judge_is_an_explicit_skip_condition(monkeypatch):
    monkeypatch.setattr(judge, "_call_via_cli", lambda *args: None)
    monkeypatch.setattr(judge, "_call_via_http", lambda *args: None)
    monkeypatch.setattr(judge, "_call_via_openai", lambda *args: None)

    with pytest.raises(judge.JudgeUnavailable, match="No authenticated grading backend"):
        judge._call_model("system", "user")
