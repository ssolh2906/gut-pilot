"""Reasoning + Evidence layer for G8 (alpha diversity significance settings:
threshold and multiple-testing correction).

research/05_alpha_diversity_contextualized.md's own G8 table gives both
decisions a fixed default (alpha=0.05 "unless the protocol pre-specified
otherwise"; BH "across the inferential alpha-diversity metric family... by
default") - there's no real per-run diagnostic that should move either
default, so the recommendation itself is fixed here (same precedent as
G6's forced rarefaction default). Claude's job is to explain that default
against this run's real group/pairing/retention numbers and ground the BH
choice in a verified citation - not to pick a different option.
"""

import json

from compute.p02_design import check_sample_independence, classify_metadata_columns, value_counts_for
from compute.p04_rarefaction import samples_above_depth

from .paperclip_tool import paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search
from .shared import DEFAULT_MODEL, build_system_prompt, run_gate_reasoning, verify_quote

MODEL = DEFAULT_MODEL

_CITATIONS = {
    "bh1995": "10.1111/j.2517-6161.1995.tb02031.x",
}

_SYSTEM_PROMPT_BASE = """You are the reasoning layer behind "Gut Pilot: The Skeptical \
Reviewer," an AI agent that reviews microbiome (16S rRNA) analysis pipelines. \
You are working the Alpha Diversity significance-settings gate (G8): the \
significance threshold and the multiple-testing correction applied to the \
primary alpha-diversity metrics (observed richness, Shannon, Simpson).

Layer discipline, non-negotiable: you SELECT and EXPLAIN, you never invent a \
number. Compute has already produced the real group counts, pairing status, \
and rarefaction-depth retention you are given; treat them as ground truth.

The two decisions are already policy defaults per your own team's research \
doc, not open questions for this run: significance threshold 0.05 (two-sided) \
unless a protocol pre-specifies otherwise, and Benjamini-Hochberg FDR control \
across the small alpha-diversity metric family (observed richness, Shannon, \
Simpson - typically 3 tests, not the hundreds of downstream differential- \
abundance tests, which are a separate hypothesis family and must not be \
pooled with this one). Your job is not to pick a different default; it is to \
explain, using this run's real numbers, why these defaults apply here and \
flag anything genuinely unusual (e.g. extremely small group sizes) as a \
caveat without changing the recommendation itself.

Before writing the correction claim, call paperclip_lookup_doi on the given \
DOI to resolve it to a corpus document ID, then call paperclip_read_excerpt \
to read the paper's real text and find a passage describing the \
false-discovery-rate procedure - quote it with its real line number. Do not \
assert from memory alone, and never fabricate a quote, a line number, or a \
paper_id. If paperclip_lookup_doi fails, that is the end of the citation \
attempt - do not substitute a different paper under this citation's label. \
If you cannot obtain a real excerpt, set "paper_id", "quote", and "line_ref" \
to null rather than inventing any of them. Every quote/line_ref/paper_id you \
report is independently re-verified against the real paper before anyone \
sees it, so there is no advantage to guessing.

When you are done, respond with ONLY a fenced ```json block (no other text) \
matching exactly this shape:
{
  "note_message": "<2-4 sentences, HTML-safe, may use <b> and <span class='mono'>, \
explaining why alpha=0.05 and BH-FDR across the alpha-diversity family apply to \
THIS run, using the real group counts, pairing, and retention numbers you were \
given - explicitly note that this correction is scoped to the alpha-diversity \
metrics only, not pooled with differential abundance>",
  "paper_id": "<the corpus document ID paperclip_lookup_doi returned, or null>",
  "quote": "<verbatim text from an L<n>: line you actually read via paperclip_read_excerpt, or null>",
  "line_ref": "<e.g. 'L45' or 'L45-L52', matching the quote, or null if quote is null>"
}
"""


def _run_reasoning(group_summary, pairing, retention_preview):
    system_prompt = build_system_prompt(_SYSTEM_PROMPT_BASE, "G8")
    user_prompt = (
        f"Real group counts for this run (null if no grouping variable / single-cohort): "
        f"{json.dumps(group_summary)}\n\n"
        f"Real sample-pairing status (from G3): {json.dumps(pairing)}\n\n"
        f"Real rarefaction-depth retention preview (from G7's current threshold): "
        f"{json.dumps(retention_preview)}\n\n"
        f"DOI to verify for the BH-FDR citation: {json.dumps(_CITATIONS)}"
    )
    return run_gate_reasoning(
        system_prompt,
        user_prompt,
        model=MODEL,
        tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
    )


def build_g8_response(session):
    sample_ids = list(session.count_table.columns)

    group_summary = None
    pairing = "independent"
    if session.metadata is not None:
        classified = classify_metadata_columns(session.metadata)
        outcome_cols = [c for c, info in classified.items() if info["role"] == "likely_outcome"]
        if outcome_cols:
            group_summary = {
                "column": outcome_cols[0],
                "counts": value_counts_for(session.metadata, sample_ids, outcome_cols[0]),
            }
        subject_cols = [c for c, info in classified.items() if info["role"] == "likely_subject"]
        if subject_cols:
            indep = check_sample_independence(sample_ids, session.metadata, subject_cols[0])
            pairing = indep["pairing"]

    depths = session.count_table.sum(axis=0).to_dict()
    split = samples_above_depth(depths, session.threshold)
    retention_preview = {"retained": len(split["retained"]), "total": len(depths), "excluded": split["excluded"]}

    reasoning = _run_reasoning(group_summary, pairing, retention_preview)

    quote, line_ref = reasoning.get("quote"), reasoning.get("line_ref")
    if quote and not verify_quote(reasoning.get("paper_id"), quote, line_ref):
        quote, line_ref = None, None

    return {
        "gate_id": "G8",
        "group_summary": group_summary,
        "pairing": pairing,
        "retention_preview": retention_preview,
        "recommendation": {
            "alpha_level": {"option_id": "0.05", "label": "RECOMMENDS CONVENTION (0.05)"},
            "correction": {"option_id": "bh", "label": "RECOMMENDS BENJAMINI-HOCHBERG"},
        },
        "note": {"severity": "info", "message": reasoning["note_message"]},
        "citation": {
            "ref_key": "bh1995", "doi": _CITATIONS["bh1995"],
            "quote": quote, "line_ref": line_ref,
        },
    }
