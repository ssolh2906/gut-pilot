"""Reasoning + Evidence layer for G4 (taxonomic rank).

Layer discipline: Compute (compute.p02_taxonomy) produces the real feature
counts at each rank; Reasoning (Claude) selects and explains the
recommended rank, grounded in research/*.md + a live Paperclip citation,
never inventing a feature count itself.

Unlike G6/G7/G9, G4 is a single-recommendation gate (docs/gates.md: P3,
"Prompt" evidence, not one of the three where the literature genuinely
disagrees) - no three-way debate, no live-citation-per-position treatment.
"""

import json

from compute.p02_taxonomy import aggregate_by_rank, compute_feature_counts

from .paperclip_tool import paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search
from .shared import DEFAULT_MODEL, build_system_prompt, run_gate_reasoning, verify_quote

MODEL = DEFAULT_MODEL

_CITATIONS = {
    # DOI verified live against the Paperclip corpus (Wirbel et al. 2019,
    # Nature Medicine, PMC7984229) - the docs/gates/G4.md example DOI
    # (10.1038/s41591-019-0405-7) does not resolve to anything in the
    # corpus; this is the real, adjacent, CRC-specific paper it likely meant.
    "wirbel2019": "10.1038/s41591-019-0406-6",
}

_RANK_LABELS = {"phylum": "Phylum", "family": "Family", "genus": "Genus"}
# Species deliberately not offered - 16S rarely resolves species reliably.
_OFFERED_RANKS = ["phylum", "family", "genus"]

_SYSTEM_PROMPT_BASE = """You are the reasoning layer behind "Gut Pilot: The Skeptical \
Reviewer," an AI agent that reviews microbiome (16S rRNA) analysis pipelines. \
You are working the Taxonomic Rank gate (G4) - deciding what feature \
resolution (phylum, family, or genus) the rest of the pipeline analyzes at.

Layer discipline, non-negotiable: you SELECT and EXPLAIN, you never invent a \
number. Compute has already produced the real feature counts at each rank \
for this dataset; treat them as ground truth and do not restate different ones.

The trade-off: higher ranks (phylum) merge more taxa together, so fewer \
statistical tests are run (more power per test) but resolution drops - you \
lose the ability to name a specific marker taxon. Genus is usually the \
finest rank a 16S table supports reliably. Default to recommending genus \
unless this dataset's feature counts show genus-level assignment is \
unusually sparse, since it is both the finest reliable resolution and the \
rank most of the relevant literature reports its markers at.

Before writing your rationale, call paperclip_lookup_doi on the DOI you are \
given to resolve the citation and get its corpus document ID, then call \
paperclip_read_excerpt to read a real supporting passage and quote it with \
its real line number - do not assert a claim from memory alone, and never \
fabricate a quote or line number you did not actually read. If paperclip_lookup_doi \
on the given DOI fails (e.g. "No documents found"), that is the end of that \
citation attempt - do NOT paperclip_search for a different paper and quote \
that instead while still labeling it under the DOI you were given. Quoting \
real text from the wrong paper under the wrong citation is worse than no \
citation at all: it looks verified but misleads anyone who checks it. If the \
given DOI does not resolve or the passage genuinely cannot be found, set \
"quote" and "line_ref" to null rather than substituting anything.

When you are done researching, respond with ONLY a fenced ```json block \
(no other text) matching exactly this shape:
{
  "recommended_rank": "genus" | "family" | "phylum",
  "rationale": "<2-3 sentences explaining the recommendation using the ACTUAL feature counts you were given>",
  "paper_id": "<the corpus document ID paperclip_lookup_doi returned, e.g. 'PMC10900887', or null if quote is null>",
  "quote": "<verbatim text from an L<n>: line you actually read via paperclip_read_excerpt, or null if you could not obtain one>",
  "line_ref": "<e.g. 'L12', matching the quote, or null if quote is null>"
}
If you were genuinely unable to get a real excerpt (tool failure, paper \
truly unavailable), set "paper_id", "quote", and "line_ref" to null rather \
than fabricating any of them - an honest gap is fine, a fabricated or \
misattributed citation is not. Every quote/line_ref you report is \
independently re-verified against the real paper before anyone sees it, so \
there is no advantage to guessing.
"""


def _run_reasoning(feature_counts):
    system_prompt = build_system_prompt(_SYSTEM_PROMPT_BASE, "G4")
    user_prompt = (
        "Real feature counts at each rank for this dataset, computed by the "
        f"Compute layer (do not change these numbers): {json.dumps(feature_counts)}\n\n"
        f"DOI to verify: {json.dumps(_CITATIONS)}"
    )
    return run_gate_reasoning(
        system_prompt,
        user_prompt,
        model=MODEL,
        tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
    )


def build_g4_response(session):
    if session.taxonomy_map is None:
        raise ValueError(
            "G4 requires real per-OTU taxonomy data, not available on the synthetic fixture dataset"
        )

    feature_counts = compute_feature_counts(session.taxonomy_map)
    offered_counts = {r: feature_counts.get(r, 0) for r in _OFFERED_RANKS}
    reasoning = _run_reasoning(offered_counts)

    ranks = [
        {
            "option_id": r, "rank": r, "label": _RANK_LABELS[r],
            "feature_count": offered_counts[r],
            "available": offered_counts[r] > 0,
            "default": r == "genus",
        }
        for r in _OFFERED_RANKS
    ]

    recommended_rank = reasoning["recommended_rank"]
    warning = None
    if session.rank == "phylum":
        warning = {
            "severity": "warn",
            "message": "Fewer, coarser categories at this rank — you gain statistical power from "
                       "fewer tests but lose the ability to name a specific marker taxon.",
        }

    quote, line_ref = reasoning.get("quote"), reasoning.get("line_ref")
    if quote and not verify_quote(reasoning.get("paper_id"), quote, line_ref):
        quote, line_ref = None, None

    return {
        "gate_id": "G4",
        "rank": session.rank,
        "ranks": ranks,
        "recommendation": {
            "option_id": recommended_rank,
            "label": f"RECOMMENDS {_RANK_LABELS[recommended_rank].upper()}",
            "rationale": reasoning["rationale"],
            "citations": [{
                "ref_key": "wirbel2019", "doi": _CITATIONS["wirbel2019"],
                "quote": quote, "line_ref": line_ref,
            }],
        },
        "warning": warning,
    }


def apply_g4_rank(session, rank):
    if rank not in _OFFERED_RANKS:
        raise ValueError(f"unknown rank: {rank}")
    if session.raw_counts is None:
        raise ValueError(
            "G4 requires real per-OTU raw counts, not available on the synthetic fixture dataset"
        )

    session.count_table = aggregate_by_rank(session.raw_counts, rank)
    session.rank = rank

    n_features = session.count_table.shape[0]
    cascades = [{
        "rule": "G4-invalidation", "target_gate": "G6", "action": "invalidate",
        "message": f"Feature resolution changed to {_RANK_LABELS[rank]} ({n_features} features) — "
                   "composition, differential abundance, and the normalization gate's numbers "
                   "must be recomputed.",
    }]

    session.log.append({
        "gate_id": "g4", "actor": "human",
        "decision": f"Analysis rank set to {_RANK_LABELS[rank]}, {n_features} features.",
        "source": "human-in-the-loop",
    })

    response = build_g4_response(session)
    response["cascades"] = cascades
    return response
