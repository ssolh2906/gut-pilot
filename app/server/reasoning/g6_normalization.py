"""Reasoning + Evidence layer for G6 (normalization strategy).

Layer discipline (docs/gates.md): Compute produces numbers, never a
sentence; Reasoning (Claude) selects and explains, never a number Compute
didn't hand it; Evidence supplies citations from Paperclip since G6's
curated T13 table isn't built yet (docs/gates.md marks it "human researcher
in progress") - this runs in Prompt mode, per the gate's evidence policy.
"""

import json

from compute.p04_normalization import clr_transform, css_scale
from compute.p04_rarefaction import samples_above_depth
from compute.p07_artifact_checks import check_normalization_metric_mismatch

from .paperclip_tool import paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search
from .shared import DEFAULT_MODEL, build_system_prompt, run_gate_reasoning, verify_quote

MODEL = DEFAULT_MODEL

# Canonical citations for the three-way debate. Re-resolved live via
# Paperclip on every request (per the runtime citation policy in
# docs/scientific_analysis_specs.md) rather than trusting a fixed quote.
_CITATIONS = {
    "schloss2024": "10.1128/msphere.00354-23",
    "mcmurdie2014": "10.1371/journal.pcbi.1003531",
    "gloor2017": "10.3389/fmicb.2017.02224",
}
_POSITION_REFS = {
    "for": "schloss2024",
    "against": "mcmurdie2014",
    "third": "gloor2017",
}


def _validate_reasoning(reasoning):
    if not isinstance(reasoning, dict):
        raise ValueError("G6 response must be an object")
    if not isinstance(reasoning.get("note_message"), str) or not reasoning["note_message"].strip():
        raise ValueError("G6 note_message is missing")
    positions = reasoning.get("positions")
    if not isinstance(positions, list) or len(positions) != len(_POSITION_REFS):
        raise ValueError("G6 must return all three literature positions")
    by_side = {position.get("side"): position for position in positions if isinstance(position, dict)}
    if set(by_side) != set(_POSITION_REFS):
        raise ValueError("G6 literature position sides are invalid")
    for side, ref_key in _POSITION_REFS.items():
        position = by_side[side]
        if position.get("ref_key") != ref_key:
            raise ValueError(f"G6 {side} position has the wrong reference")
        if not isinstance(position.get("claim"), str) or not position["claim"].strip():
            raise ValueError(f"G6 {side} position is missing its claim")
        for field in ("paper_id", "quote", "line_ref"):
            if position.get(field) is not None and not isinstance(position[field], str):
                raise ValueError(f"G6 {side} {field} must be text or null")

_SYSTEM_PROMPT_BASE = """You are the reasoning layer behind "Gut Pilot: The Skeptical \
Reviewer," an AI agent that reviews microbiome (16S rRNA) analysis pipelines. \
You are working the Normalization gate (G6) - the least methodologically \
settled step in the whole pipeline.

Layer discipline, non-negotiable: you SELECT and EXPLAIN, you never invent a \
number. Compute has already produced the retention numbers you are given; \
treat them as ground truth and do not restate different ones.

The three-way debate, as it actually stands in the literature (do not resolve \
it as if there were a consensus - there isn't):
- For rarefaction: Schloss (2024) argues repeated subsampling, done with \
  enough iterations, gives the most robust control for uneven sequencing \
  effort for DIVERSITY metrics specifically.
- Against rarefaction: McMurdie & Holmes (2014) show rarefying is \
  "statistically inadmissible" for DIFFERENTIAL ABUNDANCE specifically - it \
  discards data and inflates variance to match the smallest library.
- Third position: Gloor et al. (2017) argue the data are compositional by \
  construction, so the fix is a log-ratio transform (CLR/Aitchison) at every \
  stage, not a depth choice at all.

These three papers are not making the same claim about the same analysis. \
Route the right method to the right downstream question rather than picking \
a single "winner": rarefaction is defensible for alpha/beta diversity when \
curves plateau; CLR/log-ratio methods are preferable once the pipeline \
reaches differential abundance. CSS is a middle option that is rarely the \
right default - it assumes a scaling factor that generalizes across the \
whole dataset, which breaks down under exactly the high-variance conditions \
where this choice matters.

If forced to one per-pipeline default (as this UI requires, since one \
normalization choice feeds every downstream page), rarefaction is the safer \
default for an interpretable, non-specialist-facing run - but say explicitly \
that differential abundance downstream should use a different transform.

Before writing your claims, call paperclip_lookup_doi on each of the three \
DOIs you are given to resolve the citation and get its corpus document ID \
(e.g. "PMC10900887") - this returns metadata only, never full text. Then \
call paperclip_read_excerpt with that document ID to read the paper's real \
text and find a passage that supports the claim - start at line 1 for the \
abstract/intro, and page forward with a larger start_line if what you need \
isn't in the first window. Quote directly from the "L<n>: ..." lines you are \
shown and cite their real line numbers - do not assert a claim from memory \
alone, and never fabricate a quote or a line number you did not actually \
read. If a tool call fails or a paper's relevant passage genuinely cannot be \
found this way, say so plainly via the null fields below rather than \
inventing a quote. You may also call paperclip_search for additional \
supporting context.

When you are done researching, respond with ONLY a fenced ```json block \
(no other text) matching exactly this shape:
{
  "note_message": "<2-4 sentences, HTML-safe, may use <b> and <span class='mono'>, \
explaining the recommended strategy using the ACTUAL retention numbers you were given>",
  "positions": [
    {"side": "for", "claim": "<the for-rarefaction claim, grounded in what you read>", \
"ref_key": "schloss2024", "paper_id": "<the corpus document ID paperclip_lookup_doi \
returned, e.g. 'PMC10900887', or null if quote is null>", \
"quote": "<verbatim text from an L<n>: line you actually read \
via paperclip_read_excerpt, or null if you could not obtain one>", \
"line_ref": "<e.g. 'L45' or 'L45-L52', matching the quote, or null if quote is null>"},
    {"side": "against", "claim": "<the against-rarefaction claim>", "ref_key": "mcmurdie2014", \
"paper_id": "<...or null>", "quote": "<...or null>", "line_ref": "<...or null>"},
    {"side": "third", "claim": "<the compositional-data claim>", "ref_key": "gloor2017", \
"paper_id": "<...or null>", "quote": "<...or null>", "line_ref": "<...or null>"}
  ]
}
If you were genuinely unable to get a real excerpt for one of the three \
positions (tool failure, paper truly unavailable), set that position's \
"paper_id", "quote", and "line_ref" to null rather than fabricating any of \
them - an honest gap is fine, a fabricated or misattributed citation is not. \
Every quote/line_ref you report is independently re-verified against the \
real paper before anyone sees it, so there is no advantage to guessing.
"""


def _retention_preview(count_table, threshold):
    depths = count_table.sum(axis=0).to_dict()
    split = samples_above_depth(depths, threshold)
    return {
        "retained": len(split["retained"]),
        "total": len(depths),
        "excluded": split["excluded"],
    }


def _run_reasoning(retention_by_strategy):
    system_prompt = build_system_prompt(_SYSTEM_PROMPT_BASE, "G6")
    user_prompt = (
        "Current retention under each strategy, computed by the Compute layer "
        f"(do not change these numbers): {json.dumps(retention_by_strategy)}\n\n"
        f"DOIs to verify: {json.dumps(_CITATIONS)}"
    )
    return run_gate_reasoning(
        system_prompt,
        user_prompt,
        model=MODEL,
        tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
        validator=_validate_reasoning,
    )


def build_g6_response(session):
    comparison_table = session.count_table
    if session.metadata is not None and "DiseaseState" in session.metadata.columns:
        comparison_ids = [
            sample for sample in session.count_table.columns
            if str(session.metadata.loc[sample, "DiseaseState"]) in {"H", "CRC"}
        ]
        if comparison_ids:
            comparison_table = session.count_table[comparison_ids]
    rarefy_retention = _retention_preview(comparison_table, session.threshold)
    n = comparison_table.shape[1]
    all_retention = {"retained": n, "total": n, "excluded": []}

    reasoning_cache_key = f"reasoning:g6:{session.rank}:{session.threshold}"
    cached_reasoning = session.analysis_cache.get(reasoning_cache_key)
    if cached_reasoning:
        reasoning = cached_reasoning["reasoning"]
        reasoning_source = cached_reasoning["reasoning_source"]
    else:
        try:
            reasoning = _run_reasoning(
                {"rarefy": rarefy_retention, "css": all_retention, "clr": all_retention}
            )
            _validate_reasoning(reasoning)
            reasoning_source = "live_model"
        except Exception:
            reasoning = {
            "note_message": (
                f"For diversity endpoints, repeated rarefaction at the current "
                f"depth retains <b>{rarefy_retention['retained']}/{rarefy_retention['total']}</b> "
                "samples. Keep differential-abundance modeling on the filtered raw integer counts; "
                "one transformed matrix should not be reused for every endpoint."
            ),
            "positions": [
                {
                    "side": "for", "ref_key": "schloss2024", "paper_id": None,
                    "claim": "Repeated rarefaction is defensible for count-derived alpha and beta diversity when sequencing effort is uneven.",
                    "quote": None, "line_ref": None,
                },
                {
                    "side": "against", "ref_key": "mcmurdie2014", "paper_id": None,
                    "claim": "Rarefying discards observations and should not be used as preprocessing for differential-abundance models.",
                    "quote": None, "line_ref": None,
                },
                {
                    "side": "third", "ref_key": "gloor2017", "paper_id": None,
                    "claim": "A compositional analysis instead uses declared zero replacement and log-ratio geometry for compatible endpoints.",
                    "quote": None, "line_ref": None,
                },
                ],
            }
            reasoning_source = "data_grounded_fallback"
        session.analysis_cache[reasoning_cache_key] = {
            "reasoning": reasoning,
            "reasoning_source": reasoning_source,
        }

    options = [
        {
            "option_id": "rarefy", "label": "Rarefaction",
            "summary": "Repeated subsampling to a common depth. Discards reads and excludes shallow samples.",
            "retention_preview": rarefy_retention, "enables_gate": "G7",
            "permitted_beta_metrics": ["bray", "jaccard"], "default": True,
        },
        {
            "option_id": "css", "label": "CSS scaling",
            "summary": "Cumulative sum scaling. Keeps every sample, assumes a shared scaling regime.",
            "retention_preview": all_retention, "permitted_beta_metrics": ["bray", "jaccard"],
        },
        {
            "option_id": "clr", "label": "CLR transform",
            "summary": "Centered log-ratio. Compositionally rigorous, needs a zero-replacement rule.",
            "retention_preview": all_retention, "permitted_beta_metrics": ["aitchison"],
            "requires": ["zero_replacement_rule"],
        },
    ]
    positions = []
    for p in reasoning["positions"]:
        quote, line_ref = p.get("quote"), p.get("line_ref")
        if quote and not verify_quote(p.get("paper_id"), quote, line_ref):
            quote, line_ref = None, None
        positions.append({
            "side": p["side"], "claim": p["claim"], "ref_key": p["ref_key"],
            "doi": _CITATIONS[p["ref_key"]], "quote": quote, "line_ref": line_ref,
        })

    return {
        "gate_id": "G6",
        "strategy": session.norm_strategy,
        "recommendation": {"option_id": "rarefy", "label": "RECOMMENDS RAREFACTION"},
        "options": options,
        "note": {"severity": "info", "message": reasoning["note_message"]},
        "positions": positions,
        "cascades": [],
        "reasoning_source": reasoning_source,
    }


def apply_g6_strategy(session, strategy):
    if strategy not in {"rarefy", "css", "clr"}:
        raise ValueError(f"unknown strategy: {strategy}")

    cascades = []
    if strategy != "rarefy":
        cascades.append({
            "rule": "R3", "target_gate": "G7", "action": "disable",
            "message": f"All {session.count_table.shape[1]} samples are retained and the depth "
                       "threshold no longer applies.",
        })
    if check_normalization_metric_mismatch(strategy, session.beta_metric):
        cascades.append({
            "rule": "R2", "target_gate": "G9", "action": "force",
            "from": session.beta_metric, "to": "aitchison",
            "message": "Bray-Curtis is no longer interpretable on transformed values. "
                       "Moved the beta metric recommendation to Aitchison.",
        })
        session.beta_metric = "aitchison"
    elif strategy != "clr" and session.beta_metric == "aitchison":
        session.beta_metric = "bray"

    session.norm_strategy = strategy
    if strategy == "css":
        session.normalized_table = css_scale(session.count_table)
    elif strategy == "clr":
        session.normalized_table = clr_transform(session.count_table)
    else:
        session.normalized_table = None
    session.log.append({
        "gate_id": "g6", "actor": "human",
        "decision": f"Normalization strategy set to {strategy}.",
        "source": "human-in-the-loop",
    })

    response = build_g6_response(session)
    response["cascades"] = cascades
    return response
