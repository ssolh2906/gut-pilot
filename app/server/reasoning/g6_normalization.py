"""Reasoning + Evidence layer for G6 (normalization strategy).

Layer discipline (docs/gates.md): Compute produces numbers, never a
sentence; Reasoning (Claude) selects and explains, never a number Compute
didn't hand it; Evidence supplies citations from Paperclip since G6's
curated T13 table isn't built yet (docs/gates.md marks it "human researcher
in progress") - this runs in Prompt mode, per the gate's evidence policy.
"""

import json
import re

import anthropic

from compute.p04_normalization import clr_transform, css_scale
from compute.p04_rarefaction import samples_above_depth
from compute.p07_artifact_checks import check_normalization_metric_mismatch

from .knowledge_base import load_research_notes
from .paperclip_tool import paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search

# Haiku while iterating on this gate — cheap and fast enough to develop
# against. Swap to a stronger model (e.g. claude-opus-5) before relying on
# the reasoning quality for real use; Haiku's citation grounding especially
# should be re-verified the same way the Opus run was, since a smaller
# model may follow the paperclip_lookup_doi -> paperclip_read_excerpt ->
# quote instruction less reliably.
MODEL = "claude-haiku-4-5"

# Canonical citations for the three-way debate. Re-resolved live via
# Paperclip on every request (per the runtime citation policy in
# docs/scientific_analysis_specs.md) rather than trusting a fixed quote.
_CITATIONS = {
    "schloss2024": "10.1128/msphere.00354-23",
    "mcmurdie2014": "10.1371/journal.pcbi.1003531",
    "gloor2017": "10.3389/fmicb.2017.02224",
}

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
"ref_key": "schloss2024", "quote": "<verbatim text from an L<n>: line you actually read \
via paperclip_read_excerpt, or null if you could not obtain one>", \
"line_ref": "<e.g. 'L45' or 'L45-L52', matching the quote, or null if quote is null>"},
    {"side": "against", "claim": "<the against-rarefaction claim>", "ref_key": "mcmurdie2014", \
"quote": "<...or null>", "line_ref": "<...or null>"},
    {"side": "third", "claim": "<the compositional-data claim>", "ref_key": "gloor2017", \
"quote": "<...or null>", "line_ref": "<...or null>"}
  ]
}
If you were genuinely unable to get a real excerpt for one of the three \
positions (tool failure, paper truly unavailable), set that position's \
"quote" and "line_ref" to null rather than fabricating either one - an \
honest gap is fine, a fabricated citation is not.
"""


def _build_system_prompt():
    """Append the team's own written grounding material for G6 from
    research/*.md to the base system prompt, read fresh on every call -
    not cached - so an edit takes effect on the next request with no
    server restart.

    research/ has no step file covering G6 yet (it only goes through Step
    3, raw QC), so this is currently a no-op - Claude reasons from the
    base prompt alone until a normalization step doc is written and
    tagged `gate_ids: [G6, ...]`.
    """
    parts = [_SYSTEM_PROMPT_BASE]

    for note in load_research_notes("G6"):
        parts.append(
            "\n\nHere is one of your team's own pipeline-step 'Agent "
            "instructions' documents (from research/) that covers this "
            "gate - it is the authoritative source for this gate's "
            "contract and reasoning guidance. Read it, and where it's "
            "more specific or differs from anything above, defer to it."
            "\n\n---\n" + note + "\n---\n"
        )

    return "".join(parts)


def _retention_preview(count_table, threshold):
    depths = count_table.sum(axis=0).to_dict()
    split = samples_above_depth(depths, threshold)
    return {
        "retained": len(split["retained"]),
        "total": len(depths),
        "excluded": split["excluded"],
    }


def _extract_json_block(text):
    match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not match:
        raise ValueError("reviewer did not return a fenced json block: " + text[:500])
    return json.loads(match.group(1))


def _run_reasoning(retention_by_strategy):
    client = anthropic.Anthropic()
    user_prompt = (
        "Current retention under each strategy, computed by the Compute layer "
        f"(do not change these numbers): {json.dumps(retention_by_strategy)}\n\n"
        f"DOIs to verify: {json.dumps(_CITATIONS)}"
    )
    runner = client.beta.messages.tool_runner(
        model=MODEL,
        max_tokens=4000,
        system=_build_system_prompt(),
        tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
        messages=[{"role": "user", "content": user_prompt}],
    )
    final_text = ""
    for message in runner:
        for block in message.content:
            if block.type == "text":
                final_text = block.text
    return _extract_json_block(final_text)


def build_g6_response(session):
    rarefy_retention = _retention_preview(session.count_table, session.threshold)
    n = session.count_table.shape[1]
    all_retention = {"retained": n, "total": n, "excluded": []}

    reasoning = _run_reasoning(
        {"rarefy": rarefy_retention, "css": all_retention, "clr": all_retention}
    )

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
    positions = [{**p, "doi": _CITATIONS[p["ref_key"]]} for p in reasoning["positions"]]

    return {
        "gate_id": "G6",
        "strategy": session.norm_strategy,
        "recommendation": {"strategy": "rarefy", "label": "RECOMMENDS RAREFACTION"},
        "options": options,
        "note": {"severity": "info", "message": reasoning["note_message"]},
        "positions": positions,
        "cascades": [],
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
