// The fixed page order for the analysis pipeline. `n` is the 1-indexed
// step number shown in the tab bar's pill (matches the mock's PAGES list).
export const PAGES = [
  { id: "upload", n: 1, label: "Upload" },
  { id: "design", n: 2, label: "Design" },
  { id: "qc", n: 3, label: "Raw QC" },
  { id: "rarefy", n: 4, label: "Normalize" },
  { id: "alpha", n: 5, label: "Alpha" },
  { id: "beta", n: 6, label: "Beta" },
  { id: "da", n: 7, label: "Differential" },
  { id: "refs", n: 8, label: "Summary" },
];

export const pageIndex = (id) => PAGES.findIndex((p) => p.id === id);
