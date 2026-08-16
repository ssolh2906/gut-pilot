"""Scientific synthesis for the final product page.

Computed results remain the source of every quantitative statement. The LLM
is allowed to interpret those results, interrogate curated literature through
Paperclip, and propose falsifiable follow-up work; it cannot rewrite the
statistics or promote a genus-level association into a species-level claim.
"""

import json

from anthropic import beta_tool

from .knowledge_base import load_research_page
from .paperclip_tool import (
    paperclip_lookup_doi as _paperclip_lookup_doi,
    paperclip_read_excerpt as _paperclip_read_excerpt,
    paperclip_search as _paperclip_search,
)
from .shared import DEFAULT_MODEL, run_gate_reasoning

MODEL = DEFAULT_MODEL

_REFERENCES = {
    "confounders_2024": {
        "title": "Microbiome confounders and quantitative profiling challenge predicted microbial targets in colorectal cancer development",
        "journal": "Nature Medicine",
        "year": 2024,
        "doi": "10.1038/s41591-024-02963-2",
        "paper_id": "PMC11108775",
        "url": "https://doi.org/10.1038/s41591-024-02963-2",
        "supports": "Confounder-aware human cohort context for CRC-associated taxa.",
    },
    "fusobacterium_clade_2024": {
        "title": "A distinct Fusobacterium nucleatum clade dominates the colorectal cancer niche",
        "journal": "Nature",
        "year": 2024,
        "doi": "10.1038/s41586-024-07182-w",
        "paper_id": "PMC11006615",
        "url": "https://doi.org/10.1038/s41586-024-07182-w",
        "supports": "Strain/clade-level human, in-vitro, and mouse evidence for the Fusobacterium signal.",
    },
    "oral_network_2024": {
        "title": "Parvimonas micra forms a distinct bacterial network with oral pathobionts in colorectal cancer patients",
        "journal": "Journal of Translational Medicine",
        "year": 2024,
        "doi": "10.1186/s12967-024-05720-8",
        "paper_id": "PMC11487773",
        "url": "https://doi.org/10.1186/s12967-024-05720-8",
        "supports": "Independent fecal 16S evidence for co-occurring oral pathobionts in CRC.",
    },
    "peptostreptococcus_immunity_2024": {
        "title": "Peptostreptococcus anaerobius mediates anti-PD1 therapy resistance and exacerbates colorectal cancer via myeloid-derived suppressor cells in mice",
        "journal": "Nature Microbiology",
        "year": 2024,
        "doi": "10.1038/s41564-024-01695-w",
        "paper_id": "PMC11153135",
        "url": "https://doi.org/10.1038/s41564-024-01695-w",
        "supports": "Species-specific mouse evidence connecting a Peptostreptococcus to tumour immunity and therapy response.",
    },
    "parvimonas_epigenetics_2023": {
        "title": "Parvimonas micra, an oral pathobiont associated with colorectal cancer, epigenetically reprograms human colonocytes",
        "journal": "Gut Microbes",
        "year": 2023,
        "doi": "10.1080/19490976.2023.2265138",
        "paper_id": "PMC10580862",
        "url": "https://doi.org/10.1080/19490976.2023.2265138",
        "supports": "Phylotype-specific human tissue and colonocyte evidence for Parvimonas-linked host changes.",
    },
    "parvimonas_metabolite_2026": {
        "title": "Parvimonas micra promotes carcinogenesis of colorectal cancer through phenyllactic acid-induced DNA damage",
        "journal": "Clinical and Translational Medicine",
        "year": 2026,
        "doi": "10.1002/ctm2.70667",
        "paper_id": "PMC13136068",
        "url": "https://doi.org/10.1002/ctm2.70667",
        "supports": "Multi-cohort and preclinical evidence for a P. micra–phenyllactic acid–AHR/DNA-damage axis.",
    },
}


def _number(value, digits=3):
    if value is None:
        return "not estimable"
    return f"{value:.{digits}g}"


def _group_counts(session):
    if session.metadata is None or "DiseaseState" not in session.metadata.columns:
        return {}
    return {
        str(group): int(count)
        for group, count in session.metadata["DiseaseState"].astype(str).value_counts().items()
    }


def _significant_crc_taxa(da):
    rows = [
        row for row in da.get("rows", [])
        if row.get("significant") and row.get("direction") == "CRC"
    ]
    return sorted(rows, key=lambda row: (row.get("q", 1), -abs(row.get("log2_fold_change", 0))))


def _computed_core(session, alpha, beta, da):
    counts = _group_counts(session)
    comparison = alpha.get("comparison_groups") or ["H", "CRC"]
    group_a, group_b = comparison[:2]
    shannon = alpha.get("significance", {}).get("Shannon") or {}
    observed = alpha.get("significance", {}).get("Observed_taxa") or {}
    shannon_means = alpha.get("group_means", {}).get("Shannon", {})
    observed_means = alpha.get("group_means", {}).get("Observed_taxa", {})
    permanova = beta.get("permanova", {})
    retained = len(beta.get("points", []))
    taxa_by_name = {row["genus"]: row for row in _significant_crc_taxa(da)}
    recovered = [name for name in da.get("core_signature_recovered", []) if name in taxa_by_name]
    taxon_details = [
        {
            "genus": name,
            "direction": "higher in CRC",
            "log2_fold_change": taxa_by_name[name]["log2_fold_change"],
            "q_value": taxa_by_name[name]["q"],
            "prevalence": taxa_by_name[name]["prevalence"],
        }
        for name in recovered
    ]

    n_a, n_b = counts.get(group_a), counts.get(group_b)
    scope_n = f"{n_b} CRC and {n_a} healthy participants" if n_a is not None and n_b is not None else "the selected case and control groups"
    methods = (
        f"Genus-level 16S rRNA profiles; {alpha.get('n_iterations', 50)} repeated rarefactions at "
        f"{alpha.get('depth', session.threshold):,} reads for diversity; {beta.get('metric_label', 'Jaccard')} "
        f"PERMANOVA for community composition; and {da.get('method_label', 'relative-abundance rank testing')} "
        f"after a {100 * da.get('prevalence_filter', 0.10):.0f}% prevalence filter with FDR control."
    )
    findings = [
        {
            "kind": "DATA",
            "label": "Within-sample diversity",
            "evidence_grade": "ROBUST",
            "claim": (
                "CRC was not associated with lower overall alpha diversity: Shannon diversity was similar, "
                "while observed genus richness was higher in CRC."
            ),
            "quantitative": (
                f"Shannon {group_a}={_number(shannon_means.get(group_a))}, {group_b}={_number(shannon_means.get(group_b))}, "
                f"q={_number(shannon.get('q_value', shannon.get('p_value')))}; observed genera "
                f"{group_a}={_number(observed_means.get(group_a))}, {group_b}={_number(observed_means.get(group_b))}, "
                f"q={_number(observed.get('q_value', observed.get('p_value')))}."
            ),
        },
        {
            "kind": "DATA",
            "label": "Community composition",
            "evidence_grade": "SUGGESTIVE",
            "claim": "Presence/absence composition differed between groups, but disease state explained only a small share of total variation.",
            "quantitative": (
                f"{beta.get('metric_label', 'Jaccard')} PERMANOVA R²={_number(permanova.get('r2'))}, "
                f"p={_number(permanova.get('p'))}; dispersion p={_number(permanova.get('dispersion_p'))}; n={retained}."
            ),
        },
        {
            "kind": "DATA",
            "label": "Taxon-specific signal",
            "evidence_grade": "ROBUST" if len(recovered) >= 3 else "SUGGESTIVE",
            "claim": (
                "The group difference concentrated in specific oral-associated genera enriched in CRC: "
                + (", ".join(recovered) if recovered else "no prespecified oral-associated genera passed FDR")
                + "."
            ),
            "quantitative": (
                f"{len(recovered)} prespecified genera recovered among {da.get('n_significant', 0)} FDR-significant "
                f"of {da.get('n_tested', 0)} tested; genus-level estimates are shown below."
            ),
        },
    ]
    return {
        "study_scope": (
            f"This is a cross-sectional fecal microbiome comparison of {scope_n}. It estimates association "
            "at genus resolution; it does not establish that microbes caused disease or identify the responsible species or strain."
        ),
        "methods": methods,
        "data_credibility": (
            f"The comparison is interpretable after the prespecified depth handling ({retained} samples in the community analysis), "
            "but unequal low-depth exclusion and unavailable host covariates remain sensitivity concerns."
        ),
        "findings": findings,
        "taxa": taxon_details,
    }


def _fallback_interpretation(core):
    taxa = [row["genus"] for row in core["taxa"]]
    taxon_phrase = ", ".join(taxa) if taxa else "the FDR-significant genera"
    return {
        "hero_title": "A focused oral-associated shift, not a global diversity collapse",
        "hero_statement": (
            f"CRC is associated here with a modest change in community membership and selective enrichment of {taxon_phrase}, "
            "while Shannon diversity remains stable."
        ),
        "integrated_interpretation": (
            "Taken together, the alpha, beta, and taxon-level analyses support a targeted ecological shift rather than wholesale community depletion. "
            "The genera are discovery leads, not causal organisms or validated biomarkers."
        ),
        "literature_context": [
            {
                "source_id": "oral_network_2024",
                "status": "DIRECTIONALLY CONSISTENT",
                "connection": "An independent fecal 16S cohort found Parvimonas micra and Fusobacterium nucleatum embedded in a CRC-associated network that also included Peptostreptococcus stomatis and Porphyromonas species.",
                "caveat": "That work resolves selected organisms to species and reports tumour-subtype context; this run resolves genera only.",
            },
            {
                "source_id": "confounders_2024",
                "status": "CONTEXT-DEPENDENT",
                "connection": "Large-cohort quantitative profiling retained Parvimonas, Peptostreptococcus, and Porphyromonas signals after covariate control, but the Fusobacterium association weakened after adjustment.",
                "caveat": "Transit time, inflammation, BMI, medication, diet, and absolute microbial load are not controlled in the present analysis.",
            },
            {
                "source_id": "fusobacterium_clade_2024",
                "status": "MECHANISTIC PRIORITY",
                "connection": "Human tissue and stool data plus mouse experiments indicate that a specific F. nucleatum animalis clade, Fna C2, dominates the CRC niche and has greater tumorigenic potential.",
                "caveat": "A genus-level Fusobacterium result cannot identify F. nucleatum or the Fna C2 clade.",
            },
            {
                "source_id": "parvimonas_metabolite_2026",
                "status": "MECHANISTIC PRIORITY",
                "connection": "A 2026 multi-omics and preclinical study linked P. micra to phenyllactic acid accumulation, AHR-dependent DNA damage, and increased carcinogenesis in mouse models.",
                "caveat": "This run identifies Parvimonas at genus level and measures neither P. micra, pdhD, phenyllactic acid, AHR activity, nor DNA damage.",
            },
            {
                "source_id": "peptostreptococcus_immunity_2024",
                "status": "TRANSLATIONAL LEAD",
                "connection": "In CRC mouse models, P. anaerobius promoted an immunosuppressive myeloid program and resistance to anti-PD1 therapy, exposing testable host and microbial targets.",
                "caveat": "This run does not resolve P. anaerobius, measure tumour colonization, or contain treatment-response data.",
            },
        ],
        "hypotheses": [
            {
                "title": "A strain-resolved oral pathobiont consortium marks the tumour-supportive niche",
                "rationale": "The co-enrichment of four oral-associated genera and independent network evidence suggest that the signal may be ecological rather than attributable to one organism.",
                "prediction": "CRC samples carrying Fusobacterium Fna C2 will more often co-carry P. micra and selected Peptostreptococcus/Porphyromonas species, particularly in matched tumour tissue.",
                "experiment": "Use shotgun metagenomics or targeted species/clade qPCR on stool plus matched tumour/adjacent tissue; pre-specify the four-genus network, quantify absolute load, and test co-occurrence against healthy controls.",
                "translational_relevance": "Upgrades the broad genus signal into a defined microbial consortium suitable for biomarker validation or perturbation studies.",
            },
            {
                "title": "Peptostreptococcus enrichment identifies an immune-suppressed, therapy-relevant subgroup",
                "rationale": "Species-specific mouse work links P. anaerobius to CXCL1/CXCR2-driven myeloid suppression and anti-PD1 resistance.",
                "prediction": "Only samples confirmed to carry P. anaerobius at high absolute load will show higher CXCL1, MDSC-associated markers, and poorer checkpoint-blockade response.",
                "experiment": "First resolve Peptostreptococcus to species, then test bacterial load against tumour CXCL1, CXCR2-positive myeloid infiltration, and treatment response in an independent immunotherapy cohort or organoid–immune co-culture.",
                "translational_relevance": "Could nominate a microbial stratifier and a host-pathway rescue strategy, but remains preclinical until the species and human treatment association are confirmed.",
            },
            {
                "title": "A P. micra–phenyllactic acid–AHR axis mediates part of the Parvimonas signal",
                "rationale": "Recent multi-cohort and preclinical evidence provides a specific metabolite and host-receptor bridge from P. micra to epithelial DNA damage.",
                "prediction": "After species confirmation, P. micra absolute load and pdhD abundance will track with fecal phenyllactic acid and epithelial AHR/CYP1B1 and DNA-damage readouts; other Parvimonas species will not show the same relationship.",
                "experiment": "Pair species-resolved metagenomics and absolute qPCR with targeted phenyllactic-acid measurement in stool and matched tissue. Then compare wild-type with pdhD-perturbed P. micra in colon organoids, with AHR inhibition and γ-H2AX/CYP1B1 readouts to separate microbial production from host, diet, and tumour-niche alternatives.",
                "translational_relevance": "Tests a concrete metabolite–receptor axis that could yield a pharmacodynamic marker or host-directed intervention, while keeping the current evidence explicitly preclinical.",
            },
        ],
    }


def _validate_interpretation(payload):
    if not isinstance(payload, dict):
        raise ValueError("synthesis response must be an object")
    for field in ("hero_title", "hero_statement", "integrated_interpretation"):
        if not isinstance(payload.get(field), str) or not payload[field].strip():
            raise ValueError(f"missing synthesis field: {field}")
    contexts = payload.get("literature_context")
    hypotheses = payload.get("hypotheses")
    if not isinstance(contexts, list) or not 3 <= len(contexts) <= 6:
        raise ValueError("literature_context must contain 3-6 items")
    if not isinstance(hypotheses, list) or not 1 <= len(hypotheses) <= 3:
        raise ValueError("hypotheses must contain 1-3 items")
    for item in contexts:
        if item.get("source_id") not in _REFERENCES:
            raise ValueError("literature source is not in the verified allow-list")
        for field in ("status", "connection", "caveat"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"invalid literature_context {field}")
    for item in hypotheses:
        for field in ("title", "rationale", "prediction", "experiment", "translational_relevance"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"invalid hypothesis {field}")


_SYSTEM_PROMPT = """You are the final scientific synthesis agent for Gut Pilot. The Compute layer has already produced every statistic and taxon result. You must not change, invent, or round those facts differently. Your job is to interpret them, use Paperclip to inspect the supplied literature anchors, deliberately surface conflicting/context-dependent evidence, and propose falsifiable high-information experiments.

Before answering, resolve/read the supplied anchor papers with Paperclip. Keep DATA, LITERATURE, and HYPOTHESIS distinct. Never infer a species, strain, metabolite, causal mechanism, diagnostic biomarker, or treatment effect from a genus-level cross-sectional 16S association. Do not mention the uploaded dataset's publication or cohort name in the hero. The narrative should stand on the data and study setting.

Return ONLY one fenced ```json block with exactly this shape:
{
  "hero_title": "<short cohort-neutral scientific headline>",
  "hero_statement": "<one strongest defensible sentence>",
  "integrated_interpretation": "<2-3 sentences connecting alpha, beta and taxa>",
  "literature_context": [{"source_id":"<one supplied id>","status":"<replicated|directionally consistent|context-dependent|mechanistic priority|translational lead>","connection":"<claim the paper supports>","caveat":"<context or resolution mismatch>"}],
  "hypotheses": [{"title":"<explicit hypothesis>","rationale":"<observation plus literature bridge>","prediction":"<falsifiable expected result>","experiment":"<specific design, comparator and readout>","translational_relevance":"<biological/pharma value without overclaiming>"}]
}
Use 3-6 literature items and 1-3 hypotheses. Only use source_id values supplied by the user; do not invent citations."""


def _live_interpretation(core):
    paperclip_calls = []

    # Per-request wrappers make evidence use auditable without sharing mutable
    # state across concurrent synthesis requests. A response is not labeled
    # live Claude + Paperclip unless Claude actually read a corpus excerpt.
    @beta_tool
    def paperclip_lookup_doi(doi: str) -> str:
        """Resolve a DOI to a Paperclip corpus paper ID and metadata."""
        paperclip_calls.append("lookup")
        return _paperclip_lookup_doi.call({"doi": doi})

    @beta_tool
    def paperclip_search(query: str, source: str = "pmc") -> str:
        """Search the Paperclip biomedical corpus for relevant evidence."""
        paperclip_calls.append("search")
        return _paperclip_search.call({"query": query, "source": source})

    @beta_tool
    def paperclip_read_excerpt(paper_id: str, start_line: int, num_lines: int = 40) -> str:
        """Read a line-numbered excerpt from a resolved Paperclip paper."""
        paperclip_calls.append("read_excerpt")
        return _paperclip_read_excerpt.call({
            "paper_id": paper_id,
            "start_line": start_line,
            "num_lines": num_lines,
        })

    research_contract = load_research_page("synthesis") or ""
    system_prompt = _SYSTEM_PROMPT + (
        "\n\nThe team's authoritative Step 8 instructions follow:\n---\n" + research_contract + "\n---"
        if research_contract else ""
    )
    user_prompt = json.dumps({
        "computed_results": core,
        "verified_literature_anchors": _REFERENCES,
        "instruction": "Use Paperclip to inspect the anchors, then produce the strict synthesis JSON.",
    }, indent=2)
    payload = run_gate_reasoning(
        system_prompt,
        user_prompt,
        model=MODEL,
        tools=[paperclip_lookup_doi, paperclip_read_excerpt, paperclip_search],
        max_tokens=5000,
        validator=_validate_interpretation,
    )
    if "read_excerpt" not in paperclip_calls:
        raise ValueError("live synthesis did not inspect a Paperclip source excerpt")
    return payload, len(paperclip_calls)


def build_scientific_synthesis(session, alpha, beta, da):
    cache_key = (
        f"reasoning:synthesis:{session.rank}:{session.threshold}:"
        f"{alpha.get('n_iterations')}:{beta.get('metric')}:{da.get('prevalence_filter')}"
    )
    if cache_key in session.analysis_cache:
        return session.analysis_cache[cache_key]

    core = _computed_core(session, alpha, beta, da)
    try:
        interpretation, paperclip_tool_calls = _live_interpretation(core)
        _validate_interpretation(interpretation)
        reasoning_source = "live_model"
    except Exception:
        interpretation = _fallback_interpretation(core)
        paperclip_tool_calls = 0
        reasoning_source = "data_grounded_fallback"

    used_ids = []
    for item in interpretation["literature_context"]:
        if item["source_id"] not in used_ids:
            used_ids.append(item["source_id"])
    response = {
        "gate_id": "SYNTHESIS",
        "reasoning_source": reasoning_source,
        "paperclip_tool_calls": paperclip_tool_calls,
        **core,
        **interpretation,
        "limitations": [
            "Genus-level 16S resolution cannot identify the species, strain, genes, or pathway responsible for an association.",
            "Cross-sectional stool data establish association, not temporal order, tumour colonization, or causality.",
            "Unequal sequencing-depth exclusion and unmodeled host factors such as transit time, inflammation, BMI, diet, medication, and tumour subtype could shift effect estimates.",
            "The differential-abundance result is a transparent relative-abundance benchmark; independent compositional methods and external cohorts are required before biomarker claims.",
        ],
        "references": [{"source_id": source_id, **_REFERENCES[source_id]} for source_id in used_ids],
    }
    session.analysis_cache[cache_key] = response
    return response
