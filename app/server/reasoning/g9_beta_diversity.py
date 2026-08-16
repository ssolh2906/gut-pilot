"""Reasoning + Evidence layer for G9 (beta diversity distance metric).

research/06_beta_diversity_contextualized.md's own G9 table gives the metric
choice a context-determined default, not an open question: Bray-Curtis as
the conventional primary for genus-level 16S without a tree, UNLESS Step 4
already committed to the CLR/compositional pathway, in which case Aitchison
is the paired default (mirrors the reducer's own R2 rule in store.js, which
already force-switches the beta metric the moment normalization becomes
CLR). No phylogenetic tree exists for this project's datasets, so UniFrac
stays unavailable regardless of what Claude says (same real-world fact
compute/p06_beta_diversity.py's own docstring documents). Claude's job is to
explain the context-appropriate default against this run's real numbers,
not to pick a different one - same precedent as G6/G8's forced defaults.
"""

import json

from compute.p02_design import check_sample_independence, classify_metadata_columns, value_counts_for

from .paperclip_tool import paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search
from .shared import DEFAULT_MODEL, build_system_prompt, run_gate_reasoning, verify_quote

MODEL = DEFAULT_MODEL

# Real DOIs, matching the ones already curated in the frontend's References
# page (src/lib/data.js REFS) for the same two papers - reused here rather
# than re-guessed, so the two citation lists agree.
_CITATIONS = {
    "bray1957": "10.2307/1942268",
    "gloor2017": "10.3389/fmicb.2017.02224",
}

_SYSTEM_PROMPT_BASE = """You are the reasoning layer behind "Gut Pilot: The Skeptical \
Reviewer," an AI agent that reviews microbiome (16S rRNA) analysis pipelines. \
You are working the Beta Diversity distance-metric gate (G9).

Layer discipline, non-negotiable: you SELECT and EXPLAIN, you never invent a \
number. Compute has already produced the real normalization strategy, \
sparsity, group counts, and pairing status you are given; treat them as \
ground truth.

The metric default is already fixed by your team's own research doc, not an \
open question for this run: Bray-Curtis (abundance-weighted) is the \
conventional primary metric for genus-level 16S without a phylogenetic tree \
- UNLESS the pipeline's normalization gate (G6) already committed to the CLR \
transform, in which case Aitchison distance (log-ratio geometry) is the only \
metric that pairs correctly with CLR values, and Bray-Curtis on \
CLR-transformed values is explicitly not interpretable. You are told which \
of these two contexts applies; do not pick the other one. Jaccard \
(presence/absence) is always available as a sensitivity check, never as the \
primary. UniFrac is always unavailable for this project's data - no \
phylogenetic tree exists for any dataset this pipeline runs on - so \
explicitly note it is unavailable rather than silently omitting it.

Before writing your claim, call paperclip_lookup_doi on the given DOI (which \
one depends on which context applies - you are told which) to resolve it to \
a corpus document ID, then call paperclip_read_excerpt to read the paper's \
real text and find a passage supporting the claim - quote it with its real \
line number. Do not assert from memory alone, and never fabricate a quote, a \
line number, or a paper_id. If paperclip_lookup_doi fails, that is the end \
of the citation attempt - do not substitute a different paper under this \
citation's label. If you cannot obtain a real excerpt, set "paper_id", \
"quote", and "line_ref" to null rather than inventing any of them. Every \
quote/line_ref/paper_id you report is independently re-verified against the \
real paper before anyone sees it, so there is no advantage to guessing.

When you are done, respond with ONLY a fenced ```json block (no other text) \
matching exactly this shape:
{
  "note_message": "<2-4 sentences, HTML-safe, may use <b> and <span class='mono'>, \
explaining why the given default metric applies to THIS run, using the real \
normalization strategy, sparsity, group counts, and pairing you were given - \
explicitly mention that Jaccard remains available as a presence/absence \
sensitivity check and that UniFrac is unavailable (no phylogenetic tree)>",
  "ref_key": "<'bray1957' or 'gloor2017', matching whichever DOI you were asked to verify>",
  "paper_id": "<the corpus document ID paperclip_lookup_doi returned, or null>",
  "quote": "<verbatim text from an L<n>: line you actually read via paperclip_read_excerpt, or null>",
  "line_ref": "<e.g. 'L45' or 'L45-L52', matching the quote, or null if quote is null>"
}
"""


def _run_reasoning(norm_strategy, option_id, sparsity, group_summary, pairing, doi_to_verify):
    system_prompt = build_system_prompt(_SYSTEM_PROMPT_BASE, "G9")
    user_prompt = (
        f"Real normalization strategy from G6 (rarefy|css|clr): {json.dumps(norm_strategy)}\n"
        f"Context-determined default metric for this run: {json.dumps(option_id)}\n\n"
        f"Real sparsity (fraction of zero entries in the current count table): {json.dumps(sparsity)}\n\n"
        f"Real group counts for this run (null if no grouping variable / single-cohort): "
        f"{json.dumps(group_summary)}\n\n"
        f"Real sample-pairing status (from G3): {json.dumps(pairing)}\n\n"
        f"DOI to verify for this context's citation: {json.dumps(doi_to_verify)}"
    )
    return run_gate_reasoning(
        system_prompt,
        user_prompt,
        model=MODEL,
        tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
    )


def build_g9_response(session):
    sample_ids = list(session.count_table.columns)

    option_id = "aitchison" if session.norm_strategy == "clr" else "bray"
    ref_key = "gloor2017" if option_id == "aitchison" else "bray1957"
    doi_to_verify = {ref_key: _CITATIONS[ref_key]}

    zero_count = int((session.count_table.values == 0).sum())
    sparsity = zero_count / session.count_table.size

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

    reasoning = _run_reasoning(session.norm_strategy, option_id, sparsity, group_summary, pairing, doi_to_verify)

    quote, line_ref = reasoning.get("quote"), reasoning.get("line_ref")
    if quote and not verify_quote(reasoning.get("paper_id"), quote, line_ref):
        quote, line_ref = None, None

    label = "RECOMMENDS AITCHISON (PAIRED WITH CLR)" if option_id == "aitchison" else "RECOMMENDS BRAY-CURTIS"

    return {
        "gate_id": "G9",
        "norm_strategy": session.norm_strategy,
        "sparsity": sparsity,
        "group_summary": group_summary,
        "pairing": pairing,
        "tree_available": False,
        "recommendation": {"option_id": option_id, "label": label},
        "note": {"severity": "info", "message": reasoning["note_message"]},
        "citation": {
            "ref_key": ref_key, "doi": _CITATIONS[ref_key],
            "quote": quote, "line_ref": line_ref,
        },
    }
