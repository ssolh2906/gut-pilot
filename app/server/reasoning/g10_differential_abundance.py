"""Reasoning + Evidence layer for G10 (differential abundance prevalence filter).

research/07_differential_abundance.md's own decision table gives the
threshold a fixed starting default ("10% as the starting default, then
inspect sensitivity") - not an open question for this run, same precedent
as G6/G8/G9's forced defaults. Claude's job is to explain that default
against this run's real per-threshold feature counts and ground the
rare-feature-inflates-testing-burden argument in a verified citation, not
to pick a different threshold.
"""

import json

from .paperclip_tool import paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search
from .shared import DEFAULT_MODEL, build_system_prompt, run_gate_reasoning, verify_quote

MODEL = DEFAULT_MODEL

_CITATIONS = {
    "nearing2022": "10.1038/s41467-022-28034-z",
}

_SYSTEM_PROMPT_BASE = """You are the reasoning layer behind "Gut Pilot: The Skeptical \
Reviewer," an AI agent that reviews microbiome (16S rRNA) analysis pipelines. \
You are working the Differential Abundance prevalence-filter gate (G10): how \
many samples a taxon must be detected in before it is tested at all.

Layer discipline, non-negotiable: you SELECT and EXPLAIN, you never invent a \
number. Compute has already produced the real per-threshold feature counts, \
group counts, and DA method you are given; treat them as ground truth.

The threshold is already a policy default per your own team's research doc, \
not an open question for this run: 10% prevalence as the starting default, \
because rare features inflate the multiple-testing burden and produce \
unstable effect estimates. Your job is not to pick a different default; it \
is to explain, using this run's real per-threshold counts (how many of the \
total genera survive at 0%/5%/10%/20%), why 10% is reasonable here, and to \
flag anything genuinely unusual (e.g. a very small number of genera \
surviving even at 10%) as a caveat without changing the recommendation.

The DA method itself (CLR + Wilcoxon rank-sum, a transparent non-parametric \
sensitivity analysis - see compute/p07_differential_abundance.py) is also \
fixed for this run, not a choice you are making: ANCOM-BC2/full ALDEx2 are \
the literature's preferred primary methods but both are R-only and \
unavailable in this Python pipeline. Mention this plainly if relevant \
(e.g. "a single transparent method, not a 3-method consensus vote") rather \
than implying a fuller method panel ran.

Before writing your claim, call paperclip_lookup_doi on the given DOI to \
resolve it to a corpus document ID, then call paperclip_read_excerpt to read \
the paper's real text and find a passage supporting the rare-feature/testing- \
burden argument - quote it with its real line number. Do not assert from \
memory alone, and never fabricate a quote, a line number, or a paper_id. If \
paperclip_lookup_doi fails, that is the end of the citation attempt - do not \
substitute a different paper. If you cannot obtain a real excerpt, set \
"paper_id", "quote", and "line_ref" to null rather than inventing any of \
them. Every quote/line_ref/paper_id you report is independently re-verified \
against the real paper before anyone sees it, so there is no advantage to \
guessing.

When you are done, respond with ONLY a fenced ```json block (no other text) \
matching exactly this shape:
{
  "note_message": "<2-3 sentences, HTML-safe, may use <b> and <span class='mono'>, \
explaining why 10% prevalence applies to THIS run using the real per-threshold \
feature counts you were given, and noting the DA method is a single transparent \
sensitivity analysis (CLR + Wilcoxon), not a multi-method consensus>",
  "paper_id": "<the corpus document ID paperclip_lookup_doi returned, or null>",
  "quote": "<verbatim text from an L<n>: line you actually read via paperclip_read_excerpt, or null>",
  "line_ref": "<e.g. 'L45' or 'L45-L52', matching the quote, or null if quote is null>"
}
"""


def _run_reasoning(prevalence_options, group_summary):
    system_prompt = build_system_prompt(_SYSTEM_PROMPT_BASE, "G10")
    user_prompt = (
        f"Real feature counts remaining at each prevalence threshold, out of the total "
        f"genera in this run: {json.dumps(prevalence_options)}\n\n"
        f"Real group counts for this comparison: {json.dumps(group_summary)}\n\n"
        f"DOI to verify: {json.dumps(_CITATIONS)}"
    )
    return run_gate_reasoning(
        system_prompt,
        user_prompt,
        model=MODEL,
        tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
    )


def build_g10_response(prevalence_options: dict, group_summary: dict) -> dict:
    reasoning = _run_reasoning(prevalence_options, group_summary)

    quote, line_ref = reasoning.get("quote"), reasoning.get("line_ref")
    if quote and not verify_quote(reasoning.get("paper_id"), quote, line_ref):
        quote, line_ref = None, None

    options = [
        {"value": 0.00, "label": "No filter", "n_tested": prevalence_options["0.0"]},
        {"value": 0.05, "label": "5%", "sub": "Permissive", "n_tested": prevalence_options["0.05"]},
        {"value": 0.10, "label": "10%", "sub": "Recommended", "n_tested": prevalence_options["0.1"], "default": True},
        {"value": 0.20, "label": "20%", "sub": "Strict", "n_tested": prevalence_options["0.2"]},
    ]

    return {
        "gate_id": "G10",
        "recommendation": {"threshold": 0.10, "label": "RECOMMENDS 10%"},
        "options": options,
        "note": {"severity": "info", "message": reasoning["note_message"]},
        "citation": {
            "ref_key": "nearing2022", "doi": _CITATIONS["nearing2022"],
            "quote": quote, "line_ref": line_ref,
        },
    }
