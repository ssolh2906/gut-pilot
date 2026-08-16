import { describe, expect, it } from "vitest";

import { AUDIT_BUNDLE_FILENAME, buildAuditBundle } from "./RefsPage";

describe("audit bundle export", () => {
  it("preserves the computed results, decision trail, and limitations", () => {
    const state = {
      sessionMeta: { session_id: "baxter-demo", n_samples: 490 },
      log: [{ page: "normalization", text: "Selected repeated rarefaction." }],
    };
    const alpha = { depth: 2100, significance: { Shannon: { p_value: 0.808 } } };
    const beta = { metric: "jaccard", permanova: { r2: 0.012, p: 0.001 } };
    const da = {
      core_signature_recovered: ["Fusobacterium", "Parvimonas", "Peptostreptococcus", "Porphyromonas"],
    };
    const synthesis = { hero_title: "A focused shift", limitations: ["Resolution is limited."] };
    const generatedAt = "2026-08-16T08:00:00.000Z";

    const bundle = buildAuditBundle(state, alpha, beta, da, synthesis, generatedAt);

    expect(AUDIT_BUNDLE_FILENAME).toBe("gut-pilot-audit-bundle.json");
    expect(bundle).toMatchObject({
      schema_version: "gut-pilot-audit-bundle-v1",
      generated_at: generatedAt,
      analysis_status: "complete",
      session: state.sessionMeta,
      decisions: state.log,
      alpha_diversity: alpha,
      beta_diversity: beta,
      differential_abundance: da,
      scientific_synthesis: synthesis,
    });
    expect(bundle.limitations).toEqual(synthesis.limitations);
    expect(JSON.parse(JSON.stringify(bundle))).toEqual(bundle);
  });
});
