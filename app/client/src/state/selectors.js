// selectors.js — pure functions that combine reducer state with the static
// dataset (src/lib/data.js) to derive the numbers every page displays.
// Kept separate from components so the same derivation can be reused by a
// chart, its CSV export, and its decision-log text without drifting apart.
import { samples, DA_TAXA, DA_CLOUD, featureCount } from "../lib/data";

// Only rarefaction excludes samples by depth. CSS and CLR keep the whole
// cohort, which is exactly the trade-off the normalization gate is asking
// the user to make.
export function retained(state) {
  return state.normStrategy === "rarefy" ? samples.filter((s) => s.depth >= state.threshold) : samples.slice();
}

export function belowFloor(state) {
  return samples.filter((s) => s.depth < state.floorDepth);
}

// Benjamini-Hochberg (or Bonferroni, or none) across the retained feature
// set. Recomputed on every change to the significance or prevalence gate,
// which is the point of both.
export function adjustedP(state) {
  const kept = DA_TAXA.filter((t) => t.prev >= state.prevFilter);
  const cloud = DA_CLOUD.filter((c) => c.prev >= state.prevFilter);
  const nTested = Math.max(
    1,
    Math.round((featureCount(state.rank) * (kept.length + cloud.length)) / (DA_TAXA.length + DA_CLOUD.length))
  );
  const all = kept.map((t) => t.p).concat(cloud.map((c) => c.p)).sort((a, b) => a - b);
  // Only a sample of the feature set is modelled explicitly, so the BH rank
  // has to be scaled up to nTested alongside it. Using the raw rank against
  // a scaled n over-penalizes every p-value.
  const scale = nTested / Math.max(1, all.length);
  const adj = (p) => {
    if (state.correction === "none") return p;
    if (state.correction === "bonferroni") return Math.min(1, p * nTested);
    const r = (all.indexOf(p) + 1) * scale; // BH rank, scaled
    return Math.min(1, (p * nTested) / Math.max(1, r));
  };
  const map = new Map();
  kept.forEach((t) => map.set(t.name, adj(t.p)));
  return { map, nTested, kept, cloud, adj };
}

export function sigCount(state) {
  const { map } = adjustedP(state);
  let n = 0;
  map.forEach((q) => {
    if (q < state.alphaLevel) n++;
  });
  return n;
}

export const CORR_LABEL = { bh: "Benjamini-Hochberg", bonferroni: "Bonferroni", none: "no correction" };
