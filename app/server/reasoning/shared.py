"""Shared Reasoning-layer plumbing, generalized from the G6 gate (the first
one built) so new gates - and the chatbot - reuse the same tool-calling loop
and JSON-extraction logic instead of each reimplementing it.

run_tool_loop (raw text) is split from run_gate_reasoning (JSON-parsed)
deliberately: gates need the JSON contract, the chatbot needs free text -
one shared loop serves both.
"""

import json
import os
import re

import anthropic
from openai import OpenAI

from .knowledge_base import load_research_notes
from .paperclip_tool import paperclip_read_excerpt

# Haiku while iterating on the pipeline - cheap and fast enough to develop
# against. Swap to a stronger model (e.g. claude-opus-5) before relying on
# the reasoning quality for real use; re-verify citation grounding the same
# way the original G6/Opus run was, since a smaller model may follow the
# paperclip_lookup_doi -> paperclip_read_excerpt -> quote instruction less
# reliably.
DEFAULT_MODEL = "claude-haiku-4-5"
DEFAULT_OPENAI_MODEL = "gpt-5.6"
DEFAULT_PROVIDER_TIMEOUT_SECONDS = 45.0
_SUPPORTED_PROVIDERS = {"anthropic", "openai"}


def provider_timeout_seconds() -> float:
    """Bound a single provider request so demo fallback cannot hang forever."""
    try:
        configured = float(
            os.environ.get("GUT_PILOT_LLM_TIMEOUT_SECONDS", DEFAULT_PROVIDER_TIMEOUT_SECONDS)
        )
    except ValueError:
        configured = DEFAULT_PROVIDER_TIMEOUT_SECONDS
    return min(120.0, max(5.0, configured))


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


def _run_anthropic_tool_loop(system_prompt: str, messages: list, *, model: str,
                             tools: list, max_tokens: int) -> str:
    """Run one Claude tool-calling loop to completion (the SDK's tool_runner
    auto-executes tool calls and loops until Claude is done), and return the
    last text block Claude produced. Raw text - pass through
    extract_json_block for gates that need a JSON contract; the chatbot uses
    this directly since its output is free text.
    """
    client = anthropic.Anthropic(timeout=provider_timeout_seconds(), max_retries=0)
    runner = client.beta.messages.tool_runner(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        tools=tools,
        messages=messages,
    )
    final_text = ""
    for message in runner:
        for block in message.content:
            if block.type == "text":
                final_text = block.text
    return final_text


def configured_provider() -> str:
    """Return the selected provider; Claude deliberately remains the default."""
    provider = os.environ.get("GUT_PILOT_LLM_PROVIDER", "anthropic").strip().lower()
    if provider not in _SUPPORTED_PROVIDERS:
        raise ValueError(
            "GUT_PILOT_LLM_PROVIDER must be one of: "
            + ", ".join(sorted(_SUPPORTED_PROVIDERS))
        )
    return provider


def _openai_tool_definition(tool) -> dict:
    """Translate the existing Anthropic tool wrapper for the Responses API."""
    return {
        "type": "function",
        "name": tool.name,
        "description": tool.description,
        "parameters": tool.input_schema,
        "strict": True,
    }


def _run_openai_tool_loop(system_prompt: str, messages: list, *, tools: list,
                          max_tokens: int) -> str:
    """Run an OpenAI Responses API function-calling loop."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError(
            "OpenAI was selected but OPENAI_API_KEY is not set in the server environment"
        )

    client = OpenAI(timeout=provider_timeout_seconds(), max_retries=0)
    model = os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
    tool_by_name = {tool.name: tool for tool in tools}
    tool_defs = [_openai_tool_definition(tool) for tool in tools]
    input_items = list(messages)

    for _ in range(12):
        response = client.responses.create(
            model=model,
            instructions=system_prompt,
            input=input_items,
            tools=tool_defs,
            max_output_tokens=max_tokens,
        )
        input_items += response.output
        calls = [item for item in response.output if item.type == "function_call"]
        if not calls:
            return response.output_text

        for call in calls:
            tool = tool_by_name.get(call.name)
            if tool is None:
                output = f"ERROR: unknown tool requested: {call.name}"
            else:
                try:
                    output = tool.call(json.loads(call.arguments))
                except Exception as exc:
                    output = f"ERROR: {type(exc).__name__}: {exc}"
            input_items.append(
                {
                    "type": "function_call_output",
                    "call_id": call.call_id,
                    "output": str(output),
                }
            )
    raise RuntimeError("OpenAI tool loop exceeded 12 rounds")


def _provider_order() -> list[str]:
    """Return the primary and, when valid and distinct, fallback provider."""
    provider = configured_provider()
    fallback = os.environ.get("GUT_PILOT_LLM_FALLBACK", "").strip().lower() or None
    return [provider] + (
        [fallback] if fallback in _SUPPORTED_PROVIDERS and fallback != provider else []
    )

def _run_selected_provider(selected_provider: str, system_prompt: str, messages: list, *,
                           model: str, tools: list, max_tokens: int) -> str:
    if selected_provider == "anthropic":
        return _run_anthropic_tool_loop(
            system_prompt, messages, model=model, tools=tools, max_tokens=max_tokens
        )
    return _run_openai_tool_loop(
        system_prompt, messages, tools=tools, max_tokens=max_tokens
    )


def run_tool_loop(system_prompt: str, messages: list, *, model: str = DEFAULT_MODEL, tools=None,
                   max_tokens: int = 4000) -> str:
    """Run the selected provider, with an optional fallback in either direction.

    Claude stays the default. Setting ``GUT_PILOT_LLM_FALLBACK=openai``
    therefore gives the demo the intended Claude -> OpenAI recovery path;
    selecting OpenAI explicitly can still use Claude as its fallback.
    """
    tools = tools or []
    last_error = None
    for provider in _provider_order():
        try:
            return _run_selected_provider(
                provider, system_prompt, messages, model=model,
                tools=tools, max_tokens=max_tokens,
            )
        except Exception as exc:
            last_error = exc
    raise last_error


def run_gate_reasoning(system_prompt: str, user_prompt: str, **kw) -> dict:
    """Run and validate a structured gate response across the provider chain.

    Parsing is deliberately inside the provider loop: a successful HTTP
    response that violates the fenced-JSON contract is still a provider
    failure for this gate, so the configured fallback gets a chance before
    the caller uses its deterministic data-grounded response.
    """
    model = kw.pop("model", DEFAULT_MODEL)
    tools = kw.pop("tools", None) or []
    max_tokens = kw.pop("max_tokens", 4000)
    validator = kw.pop("validator", None)
    if kw:
        raise TypeError(f"unexpected run_gate_reasoning options: {', '.join(sorted(kw))}")
    messages = [{"role": "user", "content": user_prompt}]
    last_error = None
    for provider in _provider_order():
        try:
            text = _run_selected_provider(
                provider, system_prompt, messages, model=model,
                tools=tools, max_tokens=max_tokens,
            )
            payload = extract_json_block(text)
            if validator is not None:
                validator(payload)
            return payload
        except Exception as exc:
            last_error = exc
    raise last_error


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
