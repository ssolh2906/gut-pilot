"""Reasoning layer for the session-aware chatbot (FloatingChat).

Unlike the per-gate reasoning modules, this has no JSON output contract - it
answers a free-form question in prose, grounded in this session's own
current gate state and decision log, plus whichever research/*.md doc
covers the page the user is currently on (not every research doc on every
turn - see _PAGE_TO_GATE). Uses the same Paperclip tools as every gate, for
literature questions specifically.
"""

from .paperclip_tool import paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search
from .shared import DEFAULT_MODEL, build_system_prompt, run_tool_loop

MODEL = DEFAULT_MODEL

# Keeps chat context relevant without letting per-turn cost grow unbounded
# as a conversation gets long - last 5 exchanges (10 messages).
_MAX_HISTORY_MESSAGES = 10

# Maps the frontend's `currentPage` value to the gate whose research/*.md
# doc is most relevant there. Pages with no gate of their own (upload,
# summary) fall back to no extra research doc rather than a wrong one.
_PAGE_TO_GATE = {
    "design": "G4",
    "qc": "G5",
    "rarefy": "G6",
    "alpha": "G8",
    "beta": "G9",
    "differential": "G10",
}

_SYSTEM_PROMPT_BASE = """You are "Gut Pilot: The Skeptical Reviewer," an AI agent \
answering a scientist's questions about their own in-progress microbiome (16S \
rRNA) analysis run. You are NOT running a new analysis - you answer using the \
session context you are given below (the decisions made so far, and the \
current state of each gate) plus your own domain knowledge. Never invent a \
number that isn't in the session context or that Compute would need to \
produce; if you don't have a number you need, say so and name which page \
would produce it, rather than guessing.

If the question is genuinely about a specific citation or a claim from the \
literature, use paperclip_lookup_doi and paperclip_read_excerpt the same way \
the gate reviewers do: resolve a DOI to a corpus document ID, then read the \
paper's real text and quote a real line rather than asserting from memory \
alone. Only reach for these tools when the question calls for it - most \
questions about this run's own state don't need them, and every tool call \
costs real time and money, so skip them when the session context already \
has the answer.

Answer in 2-5 sentences of plain prose. No JSON, no markdown headers - this \
is a chat reply, not a structured gate response.
"""


def _session_context_block(session):
    lines = ["Current session state:"]
    lines.append(f"- Taxonomic rank (G4): {session.rank}")
    lines.append(f"- Normalization strategy (G6): {session.norm_strategy}")
    lines.append(f"- Rarefaction depth threshold (G7): {session.threshold}")
    lines.append(f"- Beta diversity metric (G9): {session.beta_metric}")
    lines.append(f"- QC depth floor (G5): {session.floor_depth}")
    if session.parse_report:
        tax = session.parse_report.get("taxonomy", {})
        lines.append(
            f"- Dataset: {session.parse_report.get('n_samples')} samples, "
            f"{session.parse_report.get('n_features')} raw features "
            f"({tax.get('n_otus_unassigned_at_genus')} unassigned at genus)"
        )
    if session.log:
        lines.append("")
        lines.append("Decisions made so far, in order:")
        for entry in session.log:
            lines.append(f"- [{entry.get('gate_id')}] {entry.get('decision')}")
    return "\n".join(lines)


def chat_session(session, message: str, page: str | None = None) -> dict:
    gate_id = _PAGE_TO_GATE.get(page, "G6")
    base_prompt = _SYSTEM_PROMPT_BASE + "\n\n" + _session_context_block(session)
    system_prompt = build_system_prompt(base_prompt, gate_id)

    session.chat_history.append({"role": "user", "text": message})
    recent = session.chat_history[-_MAX_HISTORY_MESSAGES:]
    messages = [{"role": h["role"], "content": h["text"]} for h in recent]

    try:
        reply = run_tool_loop(
            system_prompt,
            messages,
            model=MODEL,
            tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
        )
        source = "live_model"
    except Exception:
        reply = (
            f"This run currently uses {session.rank} features, {session.norm_strategy} "
            f"normalization, a {session.threshold:,}-read diversity threshold, and "
            f"{session.beta_metric} beta diversity. The live literature reviewer is "
            "temporarily unavailable, but the computed results and recorded gate decisions remain usable."
        )
        source = "data_grounded_fallback"
    session.chat_history.append({"role": "assistant", "text": reply})
    return {"reply": reply, "reasoning_source": source}
