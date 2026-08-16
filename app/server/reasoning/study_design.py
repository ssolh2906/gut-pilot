"""Reasoning + Evidence layer for G1 (group definition), G2 (batch/
confounding), and G3 (sample independence) - one combined call, since
research/02_study_design.md treats these as one connected decision (G2
explicitly depends on G1's confirmed group) and combining is cheaper than
three separate live calls.

G4 (taxonomic rank) is deliberately not here - it's an independent decision
with its own module (g4_taxonomic_rank.py).

Unlike G4/G6, G1-G3 have no apply_*/POST endpoint: nothing downstream
currently reads session.group_variable/batch_handling/dependence server-side
(no G8-G10 built yet), so confirming stays client-side via the existing
"Confirm design and continue" button, same as before this module existed.
"""

import json

from compute.p02_design import (
    batch_association_stats,
    batch_group_crosstab,
    check_sample_independence,
    classify_metadata_columns,
    value_counts_for,
)

from .paperclip_tool import paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search
from .shared import DEFAULT_MODEL, build_system_prompt, run_gate_reasoning, verify_quote

MODEL = DEFAULT_MODEL

_CITATIONS = {
    # Verified live against the Paperclip corpus (PMC4823848, Baxter et al.
    # 2016, Genome Medicine) - the exact paper behind the crc_baxter
    # dataset (its own abstract confirms "490 patients"). Used only when G2
    # finds no real batch column to test, per research/02_study_design.md
    # and the runtime citation policy: cite the original study's own
    # randomized-run design note as the substitute justification.
    "baxter2016": "10.1186/s13073-016-0290-3",
}
_G2_STATUSES = {
    "CLEAN", "ADJUST", "SENSITIVITY_REQUIRED", "NON_IDENTIFIABLE",
    "NO_BATCH_VARIABLE_FOUND",
}


def _validate_reasoning(reasoning, g1_candidates, g2_candidates):
    if not isinstance(reasoning, dict):
        raise ValueError("study-design response must be an object")
    if not all(isinstance(reasoning.get(gate), dict) for gate in ("g1", "g2", "g3")):
        raise ValueError("study-design response is missing a gate")

    g1 = reasoning["g1"]
    candidate_levels = {
        candidate["column"]: set(candidate["value_counts"])
        for candidate in g1_candidates
    }
    selected = g1.get("selected_column")
    comparison = g1.get("comparison_levels")
    if selected not in candidate_levels:
        raise ValueError("G1 selected_column was not a computed candidate")
    if not isinstance(comparison, list) or len(comparison) < 2:
        raise ValueError("G1 comparison_levels must contain at least two groups")
    if not set(comparison).issubset(candidate_levels[selected]):
        raise ValueError("G1 comparison_levels contain invented metadata values")
    excluded = g1.get("excluded_levels", [])
    if not isinstance(excluded, list) or not set(excluded).issubset(candidate_levels[selected]):
        raise ValueError("G1 excluded_levels contain invented metadata values")
    if not isinstance(g1.get("rationale"), str) or not g1["rationale"].strip():
        raise ValueError("G1 rationale is missing")

    status = reasoning["g2"].get("status")
    if status not in _G2_STATUSES:
        raise ValueError("G2 status is invalid")
    if not g2_candidates and status != "NO_BATCH_VARIABLE_FOUND":
        raise ValueError("G2 claimed a batch result without a computed batch variable")
    if g2_candidates and status == "NO_BATCH_VARIABLE_FOUND":
        raise ValueError("G2 ignored an available computed batch variable")
    if not isinstance(reasoning["g2"].get("note_message"), str):
        raise ValueError("G2 note_message is missing")
    for field in ("paper_id", "quote", "line_ref"):
        value = reasoning["g2"].get(field)
        if value is not None and not isinstance(value, str):
            raise ValueError(f"G2 {field} must be text or null")
    if not isinstance(reasoning["g3"].get("note_message"), str):
        raise ValueError("G3 note_message is missing")

_SYSTEM_PROMPT_BASE = """You are the reasoning layer behind "Gut Pilot: The Skeptical \
Reviewer," an AI agent that reviews microbiome (16S rRNA) analysis pipelines. \
You are working three connected Study Design gates in one pass: G1 (group \
definition), G2 (batch/confounding), and G3 (sample independence).

Layer discipline, non-negotiable: you SELECT and EXPLAIN, you never invent a \
number. Compute has already produced the real metadata column classifications, \
value counts, and (where applicable) batch association statistics you are \
given; treat them as ground truth.

G1 - Group definition: you are given every metadata column Compute classified \
as "likely_outcome" (a candidate biological grouping variable), each with its \
real value counts. Never infer biological groups from sample-ID prefixes - \
only from these actual metadata columns. If more than one candidate exists, \
pick the one that most clearly represents the intended case/control \
comparison (prefer a clean, few-valued column that matches how the field \
usually frames this comparison over a messier column with more ambiguous \
categories) and explain why you preferred it over the alternative(s) - \
naming what the alternative actually contains, not just that one exists. If \
the chosen column has more than two levels, you must also decide which \
levels form the actual biological comparison and explicitly justify \
excluding any others (e.g. an adenoma/pre-cancer arm is neither a clean \
case nor a clean control) - a real citation is not required for this \
specific judgment, but state the reasoning plainly since dropping samples \
without comment is not defensible.

G2 - Batch/confounding: you are given every metadata column Compute \
classified as "likely_batch". If this list is EMPTY, you must not fabricate \
a batch test - state plainly that no usable technical/batch column exists in \
this metadata, then look up the study's own citation (given below) and find \
a real passage where the original authors describe how samples were \
allocated to sequencing runs/batches, and cite it as the substitute \
justification for why this is less concerning than usual. If the list is \
NOT empty, you are also given real crosstab/Cramér's V association \
statistics for each candidate - classify the result as CLEAN (no material \
association), ADJUST (associated but enough within-batch overlap remains), \
SENSITIVITY_REQUIRED (specific batches disproportionately drive it), or \
NON_IDENTIFIABLE (group and batch are perfectly confounded) per the \
research doc's own algorithm - never silently recommend removing a batch.

G3 - Sample independence: you are given the real result of a subject-repeat \
check (whether a subject/patient identifier column exists in this metadata, \
and if so, whether any subject contributes more than one sample). This \
determines independent vs. paired/clustered - you are not choosing between \
these, only explaining the real result clearly, including for the simple \
case where every sample is already its own subject.

Before writing the G2 citation (only needed when no batch column was \
found), call paperclip_lookup_doi on the DOI you are given to resolve it, \
then call paperclip_read_excerpt to read the paper's real text and find a \
passage about run/batch allocation - quote it with its real line number. Do \
not assert from memory alone, and never fabricate a quote, a line number, \
or a paper_id. If paperclip_lookup_doi on the given DOI fails, that is the \
end of that citation attempt - do not search for and quote a different \
paper under the given citation's label. If you cannot obtain a real \
excerpt, set "paper_id", "quote", and "line_ref" to null rather than \
inventing any of them. Every quote/line_ref/paper_id you report is \
independently re-verified against the real paper before anyone sees it, so \
there is no advantage to guessing.

When you are done, respond with ONLY a fenced ```json block (no other text) \
matching exactly this shape:
{
  "g1": {
    "selected_column": "<the real column name you picked, e.g. 'DiseaseState'>",
    "comparison_levels": ["<the 2+ level values that form the actual comparison, e.g. 'H', 'CRC'>"],
    "excluded_levels": ["<any levels of the same column you excluded from the comparison, or empty list>"],
    "exclusion_rationale": "<why any excluded levels don't belong in this comparison, or null if none excluded>",
    "rationale": "<2-3 sentences on why this column (and not another likely_outcome candidate, if any existed) is the right grouping variable, using the REAL value counts you were given>",
    "human_confirmation_required": true
  },
  "g2": {
    "status": "CLEAN" | "ADJUST" | "SENSITIVITY_REQUIRED" | "NON_IDENTIFIABLE" | "NO_BATCH_VARIABLE_FOUND",
    "note_message": "<2-4 sentences, HTML-safe, may use <b> and <span class='mono'>, explaining the G2 result using real numbers/column names>",
    "paper_id": "<corpus document ID from paperclip_lookup_doi, or null - only relevant when status is NO_BATCH_VARIABLE_FOUND>",
    "quote": "<verbatim text you actually read via paperclip_read_excerpt, or null>",
    "line_ref": "<e.g. 'L45', matching the quote, or null if quote is null>"
  },
  "g3": {
    "note_message": "<1-3 sentences, HTML-safe, stating the inferred unit of inference using the REAL numbers you were given>"
  }
}
"""


def _run_reasoning(g1_candidates, g2_candidates, g2_diagnostics, g3_result):
    system_prompt = build_system_prompt(_SYSTEM_PROMPT_BASE, "G1")
    # research/02_study_design.md covers G1-G4 together (gate_ids: [G1, G2,
    # G3, G4]) so build_system_prompt("G1") already pulls in the one doc
    # that grounds all three gates here - no need to call it 3x.
    user_prompt = (
        "G1 candidate grouping columns (Compute-classified likely_outcome), "
        f"with real value counts: {json.dumps(g1_candidates)}\n\n"
        f"G2 candidate batch/technical columns (Compute-classified likely_batch): {json.dumps(g2_candidates)}\n"
        f"G2 real association diagnostics per candidate (empty if no candidates): {json.dumps(g2_diagnostics)}\n\n"
        f"G3 real subject-independence check result: {json.dumps(g3_result)}\n\n"
        f"DOI to use for G2's substitute citation, only if needed: {json.dumps(_CITATIONS)}"
    )
    return run_gate_reasoning(
        system_prompt,
        user_prompt,
        model=MODEL,
        tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
        validator=lambda reasoning: _validate_reasoning(
            reasoning, g1_candidates, g2_candidates
        ),
    )


def build_study_design_response(session):
    if session.metadata is None:
        raise ValueError(
            "G1-G3 require real metadata, not available on the synthetic fixture dataset"
        )

    sample_ids = list(session.count_table.columns)
    classified = classify_metadata_columns(session.metadata)

    g1_candidates = [
        {"column": c, "n_unique": info["n_unique"], "sample_values": info["sample_values"],
         "value_counts": value_counts_for(session.metadata, sample_ids, c)}
        for c, info in classified.items() if info["role"] == "likely_outcome"
    ]
    g2_candidate_cols = [c for c, info in classified.items() if info["role"] == "likely_batch"]
    g2_candidates = [{"column": c, **classified[c]} for c in g2_candidate_cols]

    g2_diagnostics = []
    if g1_candidates and g2_candidate_cols:
        # Association diagnostics need a group to test against - use the
        # first G1 candidate's real values as a provisional group for this
        # purpose (Reasoning picks the real G1 column; this only feeds G2's
        # numbers, not the G1 decision itself).
        group_col = g1_candidates[0]["column"]
        group_map = session.metadata.loc[session.metadata.index.isin(sample_ids), group_col].astype(str).to_dict()
        for batch_col in g2_candidate_cols:
            batch_map = session.metadata.loc[session.metadata.index.isin(sample_ids), batch_col].astype(str).to_dict()
            crosstab = batch_group_crosstab(batch_map, group_map)
            stats = batch_association_stats(crosstab)
            g2_diagnostics.append({"batch_column": batch_col, **stats})

    # check_sample_independence (compute/p02_design.py) is the mechanical
    # duplicate check; deciding WHICH column is the subject identifier is
    # this Reasoning module's job (classify_metadata_columns's own role
    # already reflects that same layer split for G1/G2's candidates).
    subject_cols = [c for c, info in classified.items() if info["role"] == "likely_subject"]
    if subject_cols:
        subject_col = subject_cols[0]
        subjects = session.metadata.loc[session.metadata.index.isin(sample_ids), subject_col]
        indep = check_sample_independence(sample_ids, session.metadata, subject_col)
        g3_result = {
            "subject_id_variable": subject_col,
            "n_subjects": int(subjects.nunique()),
            "n_samples": len(sample_ids),
            "repeated_subjects": len(indep["repeated_subjects"]),
            "pairing": "independent" if indep["pairing"] == "independent" else "paired_or_clustered",
        }
    else:
        g3_result = {
            "subject_id_variable": None, "n_subjects": len(sample_ids),
            "n_samples": len(sample_ids), "repeated_subjects": 0, "pairing": "independent",
        }

    try:
        reasoning = _run_reasoning(g1_candidates, g2_candidates, g2_diagnostics, g3_result)
        _validate_reasoning(reasoning, g1_candidates, g2_candidates)
        reasoning_source = "live_model"
    except Exception:
        if not g1_candidates:
            raise ValueError("No plausible biological grouping column was found in metadata")
        preferred = next(
            (candidate for candidate in g1_candidates if candidate["column"] == "DiseaseState"),
            g1_candidates[0],
        )
        counts = preferred["value_counts"]
        levels = list(counts)
        comparison = [level for level in ("H", "CRC") if level in counts]
        if len(comparison) < 2:
            comparison = levels[:2]
        excluded = [level for level in levels if level not in comparison]
        if g2_candidates:
            g2_status = "ADJUST"
            g2_note = (
                f"A candidate technical variable ({g2_candidates[0]['column']}) is present. "
                "Carry it into the model and verify within-batch overlap before interpreting the group term."
            )
        else:
            g2_status = "NO_BATCH_VARIABLE_FOUND"
            g2_note = (
                "No reusable batch, plate, lane, or sequencing-run variable is present in the uploaded metadata. "
                "The public Baxter study reports randomized allocation across sequencing runs, so the demo proceeds "
                "while recording that a direct batch cross-check is not possible from this file."
            )
        reasoning = {
            "g1": {
                "selected_column": preferred["column"],
                "comparison_levels": comparison,
                "excluded_levels": excluded,
                "exclusion_rationale": (
                    "Excluded levels represent a different clinical comparison and are not pooled with healthy controls."
                    if excluded else None
                ),
                "rationale": (
                    f"{preferred['column']} is the metadata-defined biological outcome and contains "
                    + ", ".join(f"{level}={counts[level]}" for level in levels)
                    + ". The primary comparison uses the two declared case-control levels rather than inferring groups from sample IDs."
                ),
                "human_confirmation_required": True,
            },
            "g2": {
                "status": g2_status,
                "note_message": g2_note,
                "paper_id": None,
                "quote": None,
                "line_ref": None,
            },
            "g3": {
                "note_message": (
                    f"The analysis unit is the subject: {g3_result['n_samples']} samples map to "
                    f"{g3_result['n_subjects']} subjects, with {g3_result['repeated_subjects']} repeated subjects. "
                    f"Use an {g3_result['pairing']} design."
                )
            },
        }
        reasoning_source = "data_grounded_fallback"

    g1 = reasoning["g1"]
    g2 = reasoning["g2"]
    g3 = reasoning["g3"]

    g2_quote, g2_line_ref = g2.get("quote"), g2.get("line_ref")
    if g2_quote and not verify_quote(g2.get("paper_id"), g2_quote, g2_line_ref):
        g2_quote, g2_line_ref = None, None

    g2_handling_by_status = {
        "CLEAN": "none", "NO_BATCH_VARIABLE_FOUND": "none",
        "ADJUST": "covariate", "SENSITIVITY_REQUIRED": "stratify", "NON_IDENTIFIABLE": "stratify",
    }

    return {
        "reasoning_source": reasoning_source,
        "g1": {
            "recommendation": {"option_id": "metadata", "label": "RECOMMENDS METADATA-BASED GROUPING"},
            "selected_column": g1["selected_column"],
            "comparison_levels": g1["comparison_levels"],
            "excluded_levels": g1.get("excluded_levels", []),
            "exclusion_rationale": g1.get("exclusion_rationale"),
            "group_counts": value_counts_for(session.metadata, sample_ids, g1["selected_column"]),
            "note_message": g1["rationale"],
            "human_confirmation_required": g1.get("human_confirmation_required", True),
        },
        "g2": {
            "recommendation": {
                "option_id": g2_handling_by_status.get(g2["status"], "none"),
                "label": f"G2: {g2['status'].replace('_', ' ')}",
            },
            "status": g2["status"],
            "note_message": g2["note_message"],
            "citation": {
                "ref_key": "baxter2016", "doi": _CITATIONS["baxter2016"],
                "quote": g2_quote, "line_ref": g2_line_ref,
            } if g2["status"] == "NO_BATCH_VARIABLE_FOUND" else None,
        },
        "g3": {
            "recommendation": {
                "option_id": "paired" if g3_result["pairing"] == "paired_or_clustered" else "independent",
                "label": "RECOMMENDS " + ("PAIRED/CLUSTERED" if g3_result["pairing"] == "paired_or_clustered" else "INDEPENDENT"),
            },
            "subject_id_variable": g3_result["subject_id_variable"],
            "n_subjects": g3_result["n_subjects"],
            "n_samples": g3_result["n_samples"],
            "repeated_subjects": g3_result["repeated_subjects"],
            "note_message": g3["note_message"],
        },
    }
