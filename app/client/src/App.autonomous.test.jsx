import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";

import App from "./App";
import { AppStateProvider } from "./state/AppStateContext";


const session = {
  session_id: "demo-session",
  n_samples: 490,
  n_features: 255,
  recommended_depth: 2100,
  parse_report: {
    status: "PASS",
    n_samples: 490,
    n_features: 122510,
    metadata: { supplied: true, matched_samples: 490 },
    hard_stops: [],
  },
};

const design = {
  reasoning_source: "data_grounded_fallback",
  g1: {
    selected_column: "DiseaseState",
    group_counts: { H: 172, CRC: 120, nonCRC: 198 },
    excluded_levels: ["nonCRC"],
    note_message: "Use H and CRC; exclude the adenoma/nonCRC arm.",
    recommendation: { option_id: "metadata", label: "RECOMMENDS METADATA" },
  },
  g2: {
    status: "NO_BATCH_VARIABLE_FOUND",
    note_message: "No shared batch column is available.",
    recommendation: { option_id: "none", label: "RECORDS BATCH LIMITATION" },
    citation: null,
  },
  g3: {
    n_subjects: 490,
    n_samples: 490,
    subject_id_variable: null,
    note_message: "One sample per subject; use independent tests.",
    recommendation: { option_id: "independent", label: "RECOMMENDS INDEPENDENT" },
  },
};

const rank = {
  reasoning_source: "data_grounded_fallback",
  rank: "genus",
  ranks: [
    { option_id: "phylum", label: "Phylum", feature_count: 20, available: true },
    { option_id: "family", label: "Family", feature_count: 90, available: true },
    { option_id: "genus", label: "Genus", feature_count: 255, available: true },
  ],
  recommendation: { option_id: "genus", label: "RECOMMENDS GENUS", rationale: "Matches assay resolution.", citations: [] },
  warning: null,
};

const normalization = {
  reasoning_source: "data_grounded_fallback",
  strategy: "rarefy",
  recommendation: { option_id: "rarefy", label: "RECOMMENDS RAREFACTION" },
  options: [{
    option_id: "rarefy",
    label: "Rarefaction",
    summary: "Repeated subsampling to a common depth.",
    retention_preview: { retained: 264, total: 292, excluded: [] },
  }],
  note: { severity: "info", message: "Use repeated rarefaction for diversity and restart DA from relative abundance." },
  positions: [],
  cascades: [],
};

const qc = {
  stats: { n_samples: 490, total_reads: 5_000_000, mean_depth: 10_204, min_depth: 751, max_depth: 258_713 },
  n_features: 255,
  bars: [
    { sample_id: "H1", depth: 5000, group: "H" },
    { sample_id: "H2", depth: 4500, group: "H" },
    { sample_id: "C1", depth: 5200, group: "CRC" },
    { sample_id: "C2", depth: 4800, group: "CRC" },
  ],
};

const alpha = {
  depth: 2100,
  n_iterations: 50,
  comparison_groups: ["H", "CRC"],
  group_means: {
    Observed_taxa: { H: 40.9, CRC: 44.1 },
    Shannon: { H: 3.8, CRC: 3.8 },
  },
  significance: {
    Observed_taxa: { p_value: 0.003, q_value: 0.006 },
    Shannon: { p_value: 0.808, q_value: 0.808 },
  },
};

const beta = {
  metric: "jaccard",
  metric_label: "Jaccard",
  analysis_note: "Five rarefaction distance matrices were averaged at 2,100 reads.",
  points: [
    { sample_id: "H1", group: "H", pc1: -0.1, pc2: 0.1 },
    { sample_id: "C1", group: "CRC", pc1: 0.1, pc2: -0.1 },
  ],
  permanova: { r2: 0.012, p: 0.001, permutations: 999, dispersion_p: 0.275 },
  interpretation: "Modest separation with comparable dispersion.",
};

const core = ["Fusobacterium", "Parvimonas", "Peptostreptococcus", "Porphyromonas"];
const da = {
  prevalence_filter: 0.1,
  n_tested: 101,
  n_significant: 18,
  core_signature_recovered: core,
  interpretation: "Transparent relative-abundance benchmark.",
  rows: core.map((genus, index) => ({
    genus,
    direction: "CRC",
    p: 1e-8 * (index + 1),
    q: 1e-6 * (index + 1),
    prevalence: 0.2,
    log2_fold_change: 5 - index * 0.2,
    significant: true,
  })),
};

const synthesis = {
  reasoning_source: "data_grounded_fallback",
  hero_title: "A focused oral-associated shift, not a global diversity collapse",
  hero_statement: "CRC is associated here with a modest community shift and selective genus enrichment.",
  study_scope: "Cross-sectional fecal 16S comparison of CRC and healthy participants.",
  methods: "Genus-level 16S with repeated rarefaction and FDR-controlled differential abundance.",
  data_credibility: "The comparison is interpretable with depth imbalance carried as a limitation.",
  integrated_interpretation: "The analyses support a targeted ecological shift rather than wholesale depletion.",
  findings: [
    { kind: "DATA", label: "Within-sample diversity", evidence_grade: "ROBUST", claim: "Shannon was stable.", quantitative: "q=0.808" },
    { kind: "DATA", label: "Community composition", evidence_grade: "SUGGESTIVE", claim: "Community membership differed modestly.", quantitative: "R²=0.012" },
    { kind: "DATA", label: "Taxon-specific signal", evidence_grade: "ROBUST", claim: "Four oral-associated genera were enriched.", quantitative: "4 genera" },
  ],
  taxa: da.rows.map((row) => ({
    genus: row.genus,
    direction: "higher in CRC",
    log2_fold_change: row.log2_fold_change,
    q_value: row.q,
    prevalence: row.prevalence,
  })),
  literature_context: [{
    source_id: "oral_network_2024",
    status: "DIRECTIONALLY CONSISTENT",
    connection: "An independent cohort found a related oral pathobiont network.",
    caveat: "This run resolves genera only.",
  }],
  hypotheses: [{
    title: "A strain-resolved consortium marks a tumour-supportive niche",
    rationale: "The four genera co-enrich.",
    prediction: "Species-resolved signals co-occur.",
    experiment: "Use shotgun metagenomics and matched tissue.",
    translational_relevance: "Defines a testable consortium.",
  }],
  limitations: ["Genus-level 16S cannot resolve species."],
  references: [{
    source_id: "oral_network_2024",
    title: "Oral pathobiont network in CRC",
    journal: "Journal of Translational Medicine",
    year: 2024,
    url: "https://doi.org/10.1186/s12967-024-05720-8",
    supports: "Independent cohort context.",
  }],
};

function jsonResponse(data) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

function fakeFetch(input, options = {}) {
  const url = String(input);
  if (url === "/api/session" && options.method === "POST") return jsonResponse(session);
  if (url.endsWith("/design/study-design")) return jsonResponse(design);
  if (url.endsWith("/design/rank")) return jsonResponse(rank);
  if (url.endsWith("/qc/depth")) return jsonResponse(qc);
  if (url.endsWith("/normalize/strategy")) return jsonResponse(normalization);
  if (url.endsWith("/rarefaction/depth")) return jsonResponse({ depth: 2100, retained: [], excluded: [] });
  if (url.includes("/alpha/diversity")) return jsonResponse(alpha);
  if (url.includes("/beta/diversity")) return jsonResponse(beta);
  if (url.includes("/differential-abundance")) return jsonResponse(da);
  if (url.includes("/synthesis")) return jsonResponse(synthesis);
  return Promise.reject(new Error(`Unexpected request: ${options.method ?? "GET"} ${url}`));
}

describe("autonomous Baxter demo", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advances from a dropped archive to the final live-results summary", async () => {
    render(<StrictMode><AppStateProvider><App /></AppStateProvider></StrictMode>);
    expect(screen.getByRole("button", { name: /use bundled baxter demo/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /proceed with recommended options/i }));

    const file = new File(["test archive"], "crc_baxter_results.tar.gz", { type: "application/gzip" });
    fireEvent.drop(screen.getByRole("button", { name: /upload count table/i }), {
      dataTransfer: { files: [file] },
    });

    await waitFor(
      () => expect(screen.getByRole("heading", { name: "Scientific synthesis" })).toBeTruthy(),
      { timeout: 15_000 },
    );
    await waitFor(() => expect(screen.getByText("A focused oral-associated shift, not a global diversity collapse")).toBeTruthy());
    expect(screen.getByText("R²=0.012")).toBeTruthy();
    expect(screen.getByText("Genera driving the signal")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Download audit bundle" }).disabled).toBe(false));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/differential-abundance"), expect.anything());
    const modelReadCounts = Object.fromEntries(
      ["/design/study-design", "/design/rank", "/normalize/strategy"].map((path) => [
        path,
        fetch.mock.calls.filter(([url, options]) => (
          String(url).endsWith(path) && (options?.method ?? "GET") === "GET"
        )).length,
      ]),
    );
    expect(modelReadCounts).toEqual({
      "/design/study-design": 1,
      "/design/rank": 1,
      "/normalize/strategy": 1,
    });
    expect(fetch.mock.calls.filter(([url, options]) => (
      String(url).endsWith("/normalize/strategy") && options?.method === "POST"
    ))).toHaveLength(1);
  });

  it("can recover with the bundled Baxter cohort without uploading a file", async () => {
    render(<AppStateProvider><App /></AppStateProvider>);
    fireEvent.click(screen.getByRole("button", { name: /use bundled baxter demo/i }));

    await waitFor(
      () => expect(screen.getByRole("heading", { name: "Study design" })).toBeTruthy(),
      { timeout: 5_000 },
    );
    const sessionCall = fetch.mock.calls.find(([url]) => url === "/api/session");
    expect(sessionCall[1].method).toBe("POST");
    expect(sessionCall[1].body).toBeUndefined();
  });
});
