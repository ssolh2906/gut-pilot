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
