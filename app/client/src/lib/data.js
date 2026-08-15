// data.js — deterministic placeholder dataset, ported from the
// gut-pilot_mock_260814.html <script>. Every value below is computed once,
// at module load, from a single seeded RNG stream — the same seed and call
// order as the mock, so the numbers this app shows match the reference
// prototype exactly. Everything downstream (charts, gates, tables, exports)
// reads from these constants; nothing here depends on React or UI state.
//
// This whole module is a stand-in for the real backend (Python + FastAPI,
// talking to the Claude SDK for the reviewer logic). When that exists, the
// pieces that currently read straight from this file swap to fetching a
// run's data from the API instead — the shapes below double as a sketch of
// that future response contract.
//
// UI-adjustable settings that the mock modeled as mutable module-level
// variables (floorDepth, threshold, rank, normStrategy, ...) are NOT here —
// those live in src/state, and the selectors there combine that state with
// this static data.

import { mulberry32 } from "./rng";

const rand = mulberry32(20260814);
export const fmt = (n) => n.toLocaleString("en-US");
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const THRESH_DEFAULT = 4200;
export const FLOOR_DEFAULT = 5000;

export const CATS = [
  { name: "Bacteroides", css: "var(--color-cat-1)", mark: null },
  { name: "Fusobacterium", css: "var(--color-cat-2)", mark: "up" },
  { name: "Faecalibacterium", css: "var(--color-cat-3)", mark: "down" },
  { name: "Prevotella", css: "var(--color-cat-4)", mark: null },
  { name: "Parvimonas", css: "var(--color-cat-5)", mark: "up" },
  { name: "Roseburia", css: "var(--color-cat-6)", mark: "down" },
  { name: "Blautia", css: "var(--color-cat-7)", mark: null },
  { name: "Ruminococcus", css: "var(--color-cat-8)", mark: null },
  { name: "Other", css: "var(--color-cat-9)", mark: null },
];
const H_BASE = [0.22, 0.015, 0.12, 0.1, 0.01, 0.09, 0.08, 0.06, 0.295];
const C_BASE = [0.17, 0.09, 0.05, 0.08, 0.045, 0.04, 0.07, 0.05, 0.385];
const N_PER_GROUP = 12;

// ---- samples --------------------------------------------------------
export const samples = [];
for (let g = 0; g < 2; g++) {
  const group = g === 0 ? "H" : "C";
  for (let i = 1; i <= N_PER_GROUP; i++) {
    const id = group + "-" + String(i).padStart(2, "0");
    let depth = Math.round((4000 + rand() * 26000) / 10) * 10;
    // The demo argument needs a specific depth landscape, so the random
    // draw is pinned rather than left purely to the seed: every sample is
    // lifted clear of the 6,200 band by default, H-09 and C-04 are the
    // only two below the 5,000 floor, and H-06/C-03 sit just under 6,000
    // so raising the QC floor to 6,000 visibly costs samples.
    if (depth < 6200) depth = Math.round((6200 + rand() * 3800) / 10) * 10;
    if (id === "H-09") depth = 1842;
    if (id === "C-04") depth = 2116;
    if (id === "H-06") depth = 5410;
    if (id === "C-03") depth = 5880;
    const rMax = (group === "C" ? 92 : 80) + rand() * 70;
    const rate = 1600 + rand() * 2600;
    const base = group === "H" ? H_BASE : C_BASE;
    const w = base.map((x) => Math.max(0.002, x * (0.55 + rand() * 0.9)));
    const sum = w.reduce((a, b) => a + b, 0);
    samples.push({ id, group, depth, rMax, rate, comp: w.map((x) => x / sum) });
  }
}

export const richnessAt = (s, d) => s.rMax * (1 - Math.exp(-d / s.rate));

samples.forEach((s) => {
  const d = Math.min(THRESH_DEFAULT, s.depth);
  s.observed = +richnessAt(s, d).toFixed(1);
  s.shannon = +(1.5 + rand() * 1.7 + (s.group === "H" ? 0.1 : 0)).toFixed(2);
  s.simpson = +(0.66 + rand() * 0.29).toFixed(3);
  s.chao1 = +(s.observed * (1.09 + rand() * 0.24)).toFixed(1);
  s.pielou = +(0.52 + rand() * 0.34).toFixed(2);
});

// PCoA coords. Weak separation on purpose: PERMANOVA is significant
// (p = .004) but R2 is tiny (.038), so the clouds must visibly overlap.
const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;
samples.forEach((s) => {
  s.pc1 = (s.group === "H" ? -0.42 : 0.42) + gauss() * 1.25;
  s.pc2 = (s.group === "H" ? -0.05 : 0.1) + gauss() * 1.05;
  s.assoc = clamp01(0.5 + s.pc1 * 0.22 + (rand() - 0.5) * 0.34);
});

// Distance matrix computed once so redraws stay deterministic and CSV
// export matches exactly what the heatmap shows.
export const DIST = {};
samples.forEach((a) => {
  DIST[a.id] = {};
  samples.forEach((b) => {
    if (a.id === b.id) {
      DIST[a.id][b.id] = 0;
      return;
    }
    if (DIST[b.id] && DIST[b.id][a.id] !== undefined) {
      DIST[a.id][b.id] = DIST[b.id][a.id];
      return;
    }
    const base = Math.hypot(a.pc1 - b.pc1, a.pc2 - b.pc2) / 3.2;
    DIST[a.id][b.id] = +clamp01(base * (a.group === b.group ? 0.75 : 1.05) + rand() * 0.05).toFixed(3);
  });
});

export const totalSeq = samples.reduce((a, s) => a + s.depth, 0);
export const meanDepth = Math.round(totalSeq / samples.length);
export const minDepth = Math.min(...samples.map((s) => s.depth));
export const maxDepth = Math.max(...samples.map((s) => s.depth));

// batch is deliberately confounded with group so the reviewer has
// something real to find at the batch-effects gate.
export const BATCH = {};
samples.forEach((s, i) => {
  BATCH[s.id] = s.group === "C" ? (i % 5 === 0 ? "B1" : "B2") : (i % 6 === 0 ? "B2" : "B1");
});
export function batchTable() {
  const t = { B1: { H: 0, C: 0 }, B2: { H: 0, C: 0 } };
  samples.forEach((s) => t[BATCH[s.id]][s.group]++);
  return t;
}

// Raw p-values, not adjusted ones. The significance gate recomputes q
// across the whole feature set, so significance is derived, not stored.
// `prev` is the fraction of samples the taxon is detected in, which the
// prevalence gate filters on.
export const DA_TAXA = [
  { name: "Fusobacterium", lfc: 2.6, p: 2e-6, methods: 3, dir: "up", prev: 0.62 },
  { name: "Parvimonas", lfc: 2.0, p: 4e-5, methods: 3, dir: "up", prev: 0.48 },
  { name: "Peptostreptococcus", lfc: 1.5, p: 9e-4, methods: 2, dir: "up", prev: 0.33 },
  { name: "Gemella", lfc: 1.2, p: 4.2e-3, methods: 2, dir: "up", prev: 0.24 },
  { name: "Solobacterium", lfc: 2.9, p: 1.4e-3, methods: 2, dir: "up", prev: 0.09, flagged: true },
  { name: "Porphyromonas", lfc: 0.7, p: 4.1e-2, methods: 1, dir: "ns", prev: 0.29 },
  { name: "Roseburia", lfc: -1.3, p: 1.3e-3, methods: 2, dir: "down", prev: 0.86 },
  { name: "Blautia", lfc: -0.9, p: 7.5e-3, methods: 2, dir: "down", prev: 0.91 },
  { name: "Faecalibacterium", lfc: -0.6, p: 6.2e-2, methods: 1, dir: "ns", prev: 0.95 },
];
// fixed background cloud so exports stay reproducible
export const DA_CLOUD = Array.from({ length: 46 }, () => ({
  lfc: (rand() - 0.5) * 4.6,
  p: Math.pow(10, -(rand() * rand() * 2.2)),
  prev: 0.02 + rand() * 0.9,
}));

// Feature counts per taxonomic rank. Higher rank means fewer, merged
// features: more power, less resolution.
export const RANKS = {
  phylum: { label: "Phylum", n: 14 },
  family: { label: "Family", n: 94 },
  genus: { label: "Genus", n: 187 },
};
// lineage for the composition categories, so changing rank visibly merges
// slices rather than just relabelling them
export const LINEAGE = {
  Bacteroides: { family: "Bacteroidaceae", phylum: "Bacteroidetes" },
  Fusobacterium: { family: "Fusobacteriaceae", phylum: "Fusobacteria" },
  Faecalibacterium: { family: "Ruminococcaceae", phylum: "Firmicutes" },
  Prevotella: { family: "Prevotellaceae", phylum: "Bacteroidetes" },
  Parvimonas: { family: "Peptoniphilaceae", phylum: "Firmicutes" },
  Roseburia: { family: "Lachnospiraceae", phylum: "Firmicutes" },
  Blautia: { family: "Lachnospiraceae", phylum: "Firmicutes" },
  Ruminococcus: { family: "Ruminococcaceae", phylum: "Firmicutes" },
  Other: { family: "Other", phylum: "Other" },
};
export const taxonAt = (rank, name) => (rank === "genus" ? name : LINEAGE[name] ? LINEAGE[name][rank] : name);
export const featureCount = (rank) => RANKS[rank].n;

export const ALPHA_METRICS = [
  { key: "observed", label: "Observed", p: 0.091 },
  { key: "shannon", label: "Shannon", p: 0.62 },
  { key: "simpson", label: "Simpson", p: 0.71 },
  { key: "chao1", label: "Chao1", p: 0.084 },
  { key: "pielou", label: "Pielou", p: 0.55 },
];

export const groupName = (g) => (g === "H" ? "Healthy" : "CRC");
export const groupColor = (g) => (g === "H" ? "var(--color-cat-1)" : "var(--color-cat-8)");

// ============================================================
// REFERENCES — single source of truth, reused by every citation
// ============================================================
export const REFS = [
  {
    group: "Sequencing depth and normalization",
    items: [
      {
        key: "weiss2017", authors: "Weiss S, Xu ZZ, Peddada S, et al.", year: 2017,
        title: "Normalization and microbial differential abundance strategies depend upon data characteristics",
        journal: "Microbiome 5:27", doi: "10.1186/s40168-017-0237-y",
        used: "Depth floor at 5,000 reads, artifact rule P1, normalization consistency check P9",
      },
      {
        key: "schloss2024", authors: "Schloss PD", year: 2024,
        title: "Rarefaction is currently the best approach to control for uneven sequencing effort in amplicon sequence analyses",
        journal: "mSphere 9:e00354-23", doi: "10.1128/msphere.00354-23",
        used: "Choice of repeated-subsampling rarefaction, and the 4,200 read threshold proposal",
      },
      {
        key: "subrata2024", authors: "Subrata SA, Yuda P, Artama WT, et al.", year: 2024,
        title: "Rusa deer microbiota: the importance of preliminary data analysis for meaningful diversity comparisons",
        journal: "International Microbiology", doi: "10.1007/s10123-024-00521-x",
        used: "Supporting argument that pre-analysis depth handling changes downstream diversity conclusions",
      },
      {
        key: "mcmurdie2014", authors: "McMurdie PJ, Holmes S", year: 2014,
        title: "Waste not, want not: why rarefying microbiome data is inadmissible",
        journal: "PLoS Computational Biology 10:e1003531", doi: "10.1371/journal.pcbi.1003531",
        used: "The case against rarefaction, presented at the normalization gate so the choice is not one-sided",
      },
      {
        key: "gloor2017", authors: "Gloor GB, Macklaim JM, Pawlowsky-Glahn V, Egozcue JJ", year: 2017,
        title: "Microbiome datasets are compositional: and this is not optional",
        journal: "Frontiers in Microbiology 8:2224", doi: "10.3389/fmicb.2017.02224",
        used: "The compositional position behind the CLR option, and the Aitchison distance pairing",
      },
    ],
  },
  {
    group: "Diversity and ordination",
    items: [
      {
        key: "anderson2001", authors: "Anderson MJ", year: 2001,
        title: "A new method for non-parametric multivariate analysis of variance",
        journal: "Austral Ecology 26:32-46", doi: "10.1111/j.1442-9993.2001.01070.x",
        used: "PERMANOVA design, and the recommendation of Bray-Curtis over UniFrac without a tree",
      },
      {
        key: "bray1957", authors: "Bray JR, Curtis JT", year: 1957,
        title: "An ordination of the upland forest communities of southern Wisconsin",
        journal: "Ecological Monographs 27:325-349", doi: "10.2307/1942268",
        used: "Definition of the Bray-Curtis dissimilarity used in the distance matrix and PCoA",
      },
      {
        key: "chao1984", authors: "Chao A", year: 1984,
        title: "Nonparametric estimation of the number of classes in a population",
        journal: "Scandinavian Journal of Statistics 11:265-270", doi: null,
        used: "Chao1 richness estimator in the alpha diversity panel",
      },
    ],
  },
  {
    group: "Differential abundance",
    items: [
      {
        key: "fernandes2014", authors: "Fernandes AD, Reid JN, Macklaim JM, et al.", year: 2014,
        title:
          "Unifying the analysis of high-throughput sequencing datasets: characterizing RNA-seq, 16S rRNA gene sequencing and selective growth experiments by compositional data analysis",
        journal: "Microbiome 2:15", doi: "10.1186/2049-2618-2-15",
        used: "ALDEx2, one of the three methods in the consensus call",
      },
      {
        key: "lin2020", authors: "Lin H, Peddada SD", year: 2020,
        title: "Analysis of compositions of microbiomes with bias correction",
        journal: "Nature Communications 11:3514", doi: "10.1038/s41467-020-17041-7",
        used: "ANCOM-BC, one of the three methods in the consensus call",
      },
      {
        key: "nearing2022", authors: "Nearing JT, Douglas GM, Hayes MG, et al.", year: 2022,
        title: "Microbiome differential abundance methods produce different results across 38 datasets",
        journal: "Nature Communications 13:342", doi: "10.1038/s41467-022-28034-z",
        used: "Why a single-method call is not treated as evidence, and why agreement across methods is required",
      },
      {
        key: "benjamini1995", authors: "Benjamini Y, Hochberg Y", year: 1995,
        title: "Controlling the false discovery rate: a practical and powerful approach to multiple testing",
        journal: "Journal of the Royal Statistical Society Series B 57:289-300", doi: "10.1111/j.2517-6161.1995.tb02031.x",
        used: "Default multiple-testing correction at the significance gate",
      },
    ],
  },
  {
    group: "Colorectal cancer reference biology",
    items: [
      {
        key: "thomas2019", authors: "Thomas AM, Manghi P, Asnicar F, et al.", year: 2019,
        title:
          "Metagenomic analysis of colorectal cancer datasets identifies cross-cohort microbial diagnostic signatures and a link with choline degradation",
        journal: "Nature Medicine 25:667-678", doi: "10.1038/s41591-019-0405-7",
        used: "Expected direction for Fusobacterium, Parvimonas, Peptostreptococcus and Porphyromonas, and the expectation-mismatch flag on alpha diversity",
      },
      {
        key: "duvallet2017", authors: "Duvallet C, Gibbons SM, Gurry T, et al.", year: 2017,
        title: "Meta-analysis of gut microbiome studies identifies disease-specific and shared responses",
        journal: "Nature Communications 8:1784", doi: "10.1038/s41467-017-01973-8",
        used: "Expected direction for Roseburia and Faecalibacterium in the known-taxa cross-check",
      },
    ],
  },
  {
    group: "Artifact detection",
    items: [
      {
        key: "davis2018", authors: "Davis NM, Proctor DM, Holmes SP, et al.", year: 2018,
        title: "Simple statistical identification and removal of contaminant sequences in marker-gene and metagenomics data",
        journal: "Microbiome 6:226", doi: "10.1186/s40168-018-0605-2",
        used: "Artifact rule P4, single-sample-driven taxon detection",
      },
    ],
  },
];
export const REF_INDEX = {};
REFS.forEach((g) => g.items.forEach((r) => { REF_INDEX[r.key] = r; }));
export const refLink = (k) => (REF_INDEX[k].doi ? "https://doi.org/" + REF_INDEX[k].doi : null);
export const refShort = (k) => {
  const r = REF_INDEX[k];
  const first = r.authors.split(",")[0].split(" ")[0];
  return first + (r.authors.includes(",") ? " et al. " : " ") + r.year;
};

export const KNOWN = [
  { g: "Fusobacterium", dir: "up", ours: "up, strong (3 of 3 methods)", status: "confirmed", label: "CONFIRMED", ref: "thomas2019" },
  { g: "Parvimonas", dir: "up", ours: "up, moderate (3 of 3)", status: "confirmed", label: "CONFIRMED", ref: "thomas2019" },
  { g: "Peptostreptococcus", dir: "up", ours: "up, weak (2 of 3)", status: "confirmed", label: "CONFIRMED, FRAGILE", ref: "thomas2019" },
  { g: "Porphyromonas", dir: "up", ours: "not significant (1 of 3)", status: "missing", label: "EXPECTED, MISSING", ref: "thomas2019" },
  { g: "Roseburia", dir: "down", ours: "down, weak (2 of 3)", status: "confirmed", label: "CONFIRMED, FRAGILE", ref: "duvallet2017" },
  { g: "Faecalibacterium", dir: "down", ours: "not significant (1 of 3)", status: "missing", label: "EXPECTED, MISSING", ref: "duvallet2017" },
  { g: "Solobacterium", dir: "up", ours: "up, driven by one sample", status: "novel", label: "NOVEL, UNDER REVIEW", ref: "davis2018" },
];

export const PAGE_LABEL = {
  upload: "Upload", design: "Design", qc: "Raw QC", rarefy: "Normalize",
  alpha: "Alpha", beta: "Beta", da: "Differential", refs: "Summary",
};
