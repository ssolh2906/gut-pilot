import { describe, expect, it } from "vitest";

import { initialState, reducer } from "./store";


describe("session lifecycle", () => {
  it("starts a replacement dataset as a clean scientific run", () => {
    const previous = {
      ...initialState,
      sessionId: "old-session",
      sessionMeta: { label: "old" },
      currentPage: "refs",
      unlocked: 7,
      autoProceed: true,
      threshold: 9999,
      normStrategy: "clr",
      betaMetric: "aitchison",
      studyDesignGate: { stale: true },
      g4Gate: { stale: true },
      g6Gate: { stale: true },
      log: [{ text: "old decision" }],
      design: { ...initialState.design, confirmed: true },
    };

    const next = reducer(previous, { type: "START_SESSION", id: "new-session" });

    expect(next.sessionId).toBe("new-session");
    expect(next.autoProceed).toBe(true);
    expect(next.currentPage).toBe("upload");
    expect(next.unlocked).toBe(0);
    expect(next.threshold).toBe(initialState.threshold);
    expect(next.normStrategy).toBe(initialState.normStrategy);
    expect(next.studyDesignGate).toBeNull();
    expect(next.g4Gate).toBeNull();
    expect(next.g6Gate).toBeNull();
    expect(next.log).toEqual([]);
    expect(next.design.confirmed).toBe(false);
  });
});
