// mockData.js — stand-in sample data, matching the shape the mock generates
// with its seeded RNG. Swap this for a real parsed upload later.

export function makeMockSamples() {
  const samples = [];
  for (let i = 1; i <= 12; i++) {
    samples.push({ id: `H-${String(i).padStart(2, "0")}`, group: "H", depth: 4000 + Math.round(Math.random() * 20000) });
  }
  for (let i = 1; i <= 12; i++) {
    samples.push({ id: `C-${String(i).padStart(2, "0")}`, group: "C", depth: 4000 + Math.round(Math.random() * 20000) });
  }
  return samples;
}
