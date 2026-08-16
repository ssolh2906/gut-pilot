"""Shared Reasoning-layer plumbing, generalized from the G6 gate (the first
one built) so new gates - and the chatbot - reuse the same tool-calling loop
and JSON-extraction logic instead of each reimplementing it.

run_tool_loop (raw text) is split from run_gate_reasoning (JSON-parsed)
deliberately: gates need the JSON contract, the chatbot needs free text -
one shared loop serves both.
"""

import json
import re

import anthropic

from .knowledge_base import load_research_notes
from .paperclip_tool import paperclip_read_excerpt

# Haiku while iterating on the pipeline - cheap and fast enough to develop
# against. Swap to a stronger model (e.g. claude-opus-5) before relying on
# the reasoning quality for real use; re-verify citation grounding the same
# way the original G6/Opus run was, since a smaller model may follow the
# paperclip_lookup_doi -> paperclip_read_excerpt -> quote instruction less
# reliably.
DEFAULT_MODEL = "claude-haiku-4-5"


def build_system_prompt(base_prompt: str, gate_id: str) -> str:
    """Append every research/*.md step doc that covers `gate_id` to
    `base_prompt`. Read fresh from disk on every call - not cached - so an
    edit to a research doc takes effect on the next request with no server
    restart. A gate with no covering research doc yet just gets the base
    prompt back unchanged (degrade gracefully, not an error).
    """
    parts = [base_prompt]
    for note in load_research_notes(gate_id):
        parts.append(
            "\n\nHere is one of your team's own pipeline-step 'Agent "
            "instructions' documents (from research/) that covers this "
            "gate - it is the authoritative source for this gate's "
            "contract and reasoning guidance. Read it, and where it's "
            "more specific or differs from anything above, defer to it."
            "\n\n---\n" + note + "\n---\n"
        )
    return "".join(parts)


def extract_json_block(text: str) -> dict:
    match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not match:
        raise ValueError("reviewer did not return a fenced json block: " + text[:500])
    return json.loads(match.group(1))


def run_tool_loop(system_prompt: str, messages: list, *, model: str = DEFAULT_MODEL, tools=None,
                   max_tokens: int = 4000) -> str:
    """Run one Claude tool-calling loop to completion (the SDK's tool_runner
    auto-executes tool calls and loops until Claude is done), and return the
    last text block Claude produced. Raw text - pass through
    extract_json_block for gates that need a JSON contract; the chatbot uses
    this directly since its output is free text.
    """
    client = anthropic.Anthropic()
    runner = client.beta.messages.tool_runner(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        tools=tools or [],
        messages=messages,
    )
    final_text = ""
    for message in runner:
        for block in message.content:
            if block.type == "text":
                final_text = block.text
    return final_text


def run_gate_reasoning(system_prompt: str, user_prompt: str, **kw) -> dict:
    """run_tool_loop + extract_json_block, for gates whose contract is a
    fenced JSON block (every gate so far - the chatbot calls run_tool_loop
    directly instead, since its output is free text)."""
    text = run_tool_loop(system_prompt, [{"role": "user", "content": user_prompt}], **kw)
    return extract_json_block(text)


_LINE_NUM_RE = re.compile(r"L(\d+)")


def _normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _parse_line_ref(line_ref: str) -> tuple[int, int] | None:
    """Accepts any of the formats the model actually produces in practice:
    a single line ("L45"), a contiguous range ("L45-L52"), or a
    comma-separated list of non-adjacent lines a quote spans ("L20, L25") -
    returns (min, max) to fetch as a window, or None if nothing parses."""
    nums = [int(n) for n in _LINE_NUM_RE.findall(line_ref)]
    if not nums:
        return None
    return min(nums), max(nums)


def verify_quote(paper_id: str | None, quote: str | None, line_ref: str | None, buffer: int = 3) -> bool:
    """Independently re-fetch the claimed excerpt and confirm the quote is
    real text at (near) that line - never trust the model's self-report of
    its own citation. A live test of G4's first citation caught two distinct
    failure modes in one pass: a real quote attributed to the wrong paper,
    and (even after that DOI was fixed) a fully invented quote attributed to
    a correct, resolving paper. Both looked identical to a real citation
    from the JSON alone; only re-fetching the actual source catches either.

    Callers should null out quote/line_ref when this returns False, so the
    UI degrades to the same "no verified excerpt" state already built for
    an honest gap - a caught fabrication should look exactly like the model
    admitting it couldn't verify something, not like an error.
    """
    if not paper_id or not quote or not line_ref:
        return False
    parsed = _parse_line_ref(line_ref)
    if not parsed:
        return False
    start, end = parsed

    fetch_start = max(1, start - buffer)
    num_lines = min((end - fetch_start + 1) + buffer, 200)
    excerpt = paperclip_read_excerpt(paper_id=paper_id, start_line=fetch_start, num_lines=num_lines)
    if excerpt.startswith("ERROR:"):
        return False

    text = "\n".join(re.sub(r"^L\d+:\s?", "", line) for line in excerpt.splitlines())
    return _normalize_ws(quote) in _normalize_ws(text)
