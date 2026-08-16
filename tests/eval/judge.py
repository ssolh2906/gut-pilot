#!/usr/bin/env python3
"""
tests/eval/judge.py -- LLM-judge grading for the qualitative (check_type ==
"llm_judge") test cases in manifest/crc_baxter_manifest.json. These are the
tests that check whether a piece of agent-generated narrative text actually
says the right thing (e.g. "does the gate-note acknowledge both published
normalization precedents"), which a numeric diff can't grade.

Grading backend, in order of preference:
  1. The `claude` CLI in non-interactive print mode (`claude -p --output-format
     json`). This is the default and requires NO separate API key -- it rides
     on whatever auth is already active for your Claude Code session (OAuth
     login), the same account this eval harness itself was built from. This
     is deliberately the default: the eval grading a run shouldn't need its
     own credential just because the *agent pipeline* being graded happens to
     call an LLM internally.
  2. A raw HTTPS call to the Anthropic Messages API (stdlib urllib, no SDK
     dependency), used only if the `claude` CLI can't be found AND
     ANTHROPIC_API_KEY is set. This exists for headless CI runners that don't
     have the CLI installed but do have an API key provisioned.
If neither is available, JudgeUnavailable is raised, and runner.py reports
the check as SKIPPED -- never silently passed.

Env vars:
  CLAUDE_JUDGE_BINARY   force a specific claude CLI path (skips auto-detect)
  ANTHROPIC_EVAL_MODEL  model alias/name for grading (default: sonnet)
  ANTHROPIC_API_KEY     only used by the HTTP fallback, not the CLI path
"""
import json
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.request

DEFAULT_MODEL = "sonnet"
API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
HTTP_FALLBACK_MODEL = "claude-sonnet-5"  # the HTTP API wants a full model id, not an alias

GRADER_SYSTEM_PROMPT = """You are a strict, skeptical grader for a microbiome-analysis AI agent's \
output. You are given a RUBRIC describing exactly what a piece of agent-generated text must \
contain or avoid, and the CONTENT to grade against it. Your job is adversarial verification, not \
charity: if the content is vague, generic, or only partially satisfies the rubric, that is a FAIL. \
Only PASS if the rubric's requirements are clearly, specifically met. Do not use any tools -- this \
is a pure text-judgment task with everything you need already in this message.

Respond with ONLY a single JSON object on one line, no markdown fences, no commentary before or \
after, in exactly this shape -- "reasoning" MUST come first, and "pass" MUST be the logical \
conclusion that follows from it (never write reasoning that argues one way and then flip the \
verdict the other way):
{"reasoning": "one or two sentences citing the specific evidence for your verdict", "pass": true or false}
"""


class JudgeUnavailable(RuntimeError):
    """Raised when the judge can't run at all (e.g. no CLI and no API key) --
    distinct from a judge call that ran and returned a FAIL verdict."""


def _extract_json(text):
    """Pull the first {...} JSON object out of a model response, tolerating
    stray markdown fences or leading/trailing prose."""
    text = text.strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1)
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        text = brace_match.group(0)
    return json.loads(text)


def _find_claude_binary():
    forced = os.environ.get("CLAUDE_JUDGE_BINARY")
    if forced and shutil.which(forced) or (forced and os.path.isfile(forced)):
        return forced
    exec_path = os.environ.get("CLAUDE_CODE_EXECPATH")
    if exec_path and os.path.isfile(exec_path):
        return exec_path
    on_path = shutil.which("claude")
    if on_path:
        return on_path
    return None


def _call_via_cli(system, user, model):
    binary = _find_claude_binary()
    if not binary:
        return None
    prompt = f"{system}\n\n{user}"
    proc = subprocess.run(
        [binary, "-p", "--output-format", "json", "--model", model, prompt],
        capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"claude CLI exited {proc.returncode}: {proc.stderr.strip()[:500]}")
    envelope = json.loads(proc.stdout)
    if envelope.get("is_error"):
        raise RuntimeError(f"claude CLI reported an error: {envelope.get('result')}")
    return envelope.get("result", "")


def _call_via_http(system, user, model):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    payload = json.dumps({
        "model": model,
        "max_tokens": 512,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")
    req = urllib.request.Request(
        API_URL, data=payload, method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Anthropic API HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:500]}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Anthropic API network error: {e}") from e
    parts = body.get("content", [])
    text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
    if not text:
        raise RuntimeError(f"Anthropic API returned no text content: {body}")
    return text


def _call_model(system, user):
    """Try the CLI first (no separate API key needed), then the HTTP fallback."""
    model_alias = os.environ.get("ANTHROPIC_EVAL_MODEL", DEFAULT_MODEL)
    cli_result = _call_via_cli(system, user, model_alias)
    if cli_result is not None:
        return cli_result
    http_model = os.environ.get("ANTHROPIC_EVAL_MODEL", HTTP_FALLBACK_MODEL)
    http_result = _call_via_http(system, user, http_model)
    if http_result is not None:
        return http_result
    raise JudgeUnavailable(
        "No grading backend available: the `claude` CLI was not found on PATH "
        "(and CLAUDE_CODE_EXECPATH / CLAUDE_JUDGE_BINARY are not set to a valid "
        "binary), and ANTHROPIC_API_KEY is not set for the HTTP fallback. "
        "Install/authenticate the Claude Code CLI, or set ANTHROPIC_API_KEY, "
        "to enable llm_judge checks."
    )


def grade(rubric: str, content: str, test_id: str = "") -> dict:
    """Grade `content` against `rubric`. Returns {"pass": bool, "reasoning": str}.
    Raises JudgeUnavailable if no grading backend is configured."""
    user_msg = f"RUBRIC:\n{rubric}\n\nCONTENT TO GRADE ({test_id}):\n{content}"
    raw = _call_model(GRADER_SYSTEM_PROMPT, user_msg)
    try:
        return _extract_json(raw)
    except (json.JSONDecodeError, AttributeError):
        # one repair attempt: ask again, more forcefully, for bare JSON only
        repair_msg = (
            f"Your previous response was not valid bare JSON: {raw!r}\n\n"
            f"Re-answer the SAME question with ONLY the JSON object, nothing else.\n\n{user_msg}"
        )
        raw2 = _call_model(GRADER_SYSTEM_PROMPT, repair_msg)
        return _extract_json(raw2)


if __name__ == "__main__":
    # quick manual smoke test: python tests/eval/judge.py
    demo_rubric = "The text must mention the number 42 explicitly."
    print("backend:", _find_claude_binary() or "(HTTP fallback / unavailable)")
    print("PASS case:", grade(demo_rubric, "The answer to everything is 42.", "demo-pass"))
    print("FAIL case:", grade(demo_rubric, "The answer to everything is unclear.", "demo-fail"))
