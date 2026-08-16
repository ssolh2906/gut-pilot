// chartHelpers.js — small scale/tick math shared by the hand-rolled SVG
// charts (BarChart, ScatterChart, ...). No charting library: every chart in
// the mock is plain <svg>, and ChartTools/exportUtils already assume that,
// so this stays consistent rather than introducing a dependency.

// Linear scale: maps a value in [domainMin, domainMax] to [rangeMin, rangeMax].
export function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
  const span = domainMax - domainMin || 1;
  return (v) => rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin);
}

// Evenly spaced tick fractions (0..1) for gridlines, e.g. [0, .25, .5, .75, 1].
export function tickFractions(count = 4) {
  return Array.from({ length: count + 1 }, (_, i) => i / count);
}

// Color-scale helpers for the PCoA (diverging) and distance-matrix
// (sequential) charts. Read CSS custom properties live rather than hardcoding
// hex values, so the gradient follows the light/dark theme automatically —
// same technique the mock uses (cssVar/hex2rgb/mix), ported to a module the
// scatter/heatmap chart components can both import.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mixRgb(a, b, f) {
  return "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",") + ")";
}

// t in [0,1]: 0 = --color-div-lo, 0.5 = --color-div-mid, 1 = --color-div-hi.
export function divergeColor(t) {
  const lo = hexToRgb(cssVar("--color-div-lo"));
  const mid = hexToRgb(cssVar("--color-div-mid"));
  const hi = hexToRgb(cssVar("--color-div-hi"));
  return t < 0.5 ? mixRgb(lo, mid, t / 0.5) : mixRgb(mid, hi, (t - 0.5) / 0.5);
}

// t in [0,1]: 0 = --color-seq-lo, 1 = --color-seq-hi.
export function sequentialColor(t) {
  return mixRgb(hexToRgb(cssVar("--color-seq-lo")), hexToRgb(cssVar("--color-seq-hi")), t);
}
