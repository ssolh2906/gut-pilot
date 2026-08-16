// store.js — the reducer for every UI-adjustable gate setting, plus page
// navigation and the decision log. This is the React-idiomatic replacement
// for the mock's mutable module-level variables (design, normStrategy,
// floorDepth, threshold, alphaLevel, correction, betaMetric, prevFilter,
// revealed, LOG, currentPage, unlocked) — one reducer instead of many
// loose `let`s, so every page reads and updates the same source of truth
// through a single dispatch.
import { FLOOR_DEFAULT, THRESH_DEFAULT } from "../lib/data";
import { PAGES, pageIndex } from "../lib/pages";

export const initialState = {
  design: {
    groupSource: "inferred", // "inferred" | "manual" | "none"
    confirmed: false,
    singleCohort: false,
    batchHandling: "none", // "none" | "covariate" | "stratify"
    pairing: "independent", // "independent" | "paired"
  },
  rank: "genus", // "phylum" | "family" | "genus"
  floorDepth: FLOOR_DEFAULT,
  threshold: THRESH_DEFAULT,
  normStrategy: "rarefy", // "rarefy" | "css" | "clr"
  alphaLevel: 0.05,
  correction: "bh", // "bh" | "bonferroni" | "none"
  betaMetric: "bray", // "bray" | "jaccard" | "aitchison"
  prevFilter: 0.1,
  daViewed: false,
  revealed: {}, // { [blockId]: true }
  log: [], // [{ key?, page, human?, conf?, ref?, src?, text }]
  groupVersion: 0, // bumped when a sample's group is toggled in place (see actions.toggleSampleGroup)
  currentPage: "upload",
  unlocked: 0, // furthest reachable index into PAGES
  autoProceed: false, // "proceed with recommended options" — see hooks/useAutoProceed.js

  // ---- backend wiring ----
  sessionId: null, // set once the backend has loaded a dataset (see UploadPage)
  studyDesignGate: null, // cached GET .../design/study-design response (G1+G2+G3
  // combined) — same caching rationale as g4Gate/g6Gate below.
  g4Gate: null, // cached GET/POST .../design/rank response — same caching
  // rationale as g6Gate below (live Claude + Paperclip call).
  g6Gate: null, // cached GET/POST .../normalize/strategy response. This is a
  // live Claude + Paperclip call, so it's fetched once on demand (see
  // NormalizationPage) and cached here rather than re-fetched on every mount.
  g8Gate: null, // cached GET .../alpha/significance response — same caching
  // rationale as g6Gate above.
  g9Gate: null, // cached GET .../beta/metric response — same caching
  // rationale as g6Gate above.
  daGate: null, // cached GET .../da/prevalence response (G10 note) — same
  // caching rationale as g6Gate above. Real per-threshold results (the
  // volcano/known-taxa/artifact panels) are NOT cached here — those are
  // cheap Compute-only calls refetched on every threshold change, see DaPage.
  synthesisGate: null, // cached GET .../synthesis response — same caching
  // rationale as g6Gate above.
};

export function reducer(state, action) {
  switch (action.type) {
    case "SET_GROUP_SOURCE": {
      const groupSource = action.source;
      return {
        ...state,
        design: { ...state.design, groupSource, singleCohort: groupSource === "none" },
      };
    }
    case "BUMP_GROUP_VERSION":
      return { ...state, groupVersion: state.groupVersion + 1 };
    case "SET_BATCH_HANDLING":
      return { ...state, design: { ...state.design, batchHandling: action.handling } };
    case "SET_PAIRING":
      return { ...state, design: { ...state.design, pairing: action.pairing } };
    case "SET_RANK":
      return { ...state, rank: action.rank };
    case "CONFIRM_DESIGN":
      return { ...state, design: { ...state.design, confirmed: true } };

    case "SET_FLOOR":
      return { ...state, floorDepth: action.value };
    case "SET_THRESHOLD":
      return { ...state, threshold: action.value };

    case "SET_NORM_STRATEGY": {
      const normStrategy = action.value;
      let betaMetric = state.betaMetric;
      // R2 in the mock: keep the beta metric consistent with the transform.
      if (normStrategy === "clr" && betaMetric !== "aitchison") betaMetric = "aitchison";
      if (normStrategy !== "clr" && betaMetric === "aitchison") betaMetric = "bray";
      return { ...state, normStrategy, betaMetric };
    }
    case "SET_ALPHA_LEVEL":
      return { ...state, alphaLevel: action.value };
    case "SET_CORRECTION":
      return { ...state, correction: action.value };
    case "SET_BETA_METRIC":
      return { ...state, betaMetric: action.value };
    case "SET_PREV_FILTER":
      return { ...state, prevFilter: action.value };
    case "SET_DA_VIEWED":
      return { ...state, daViewed: true };

    case "REVEAL":
      return { ...state, revealed: { ...state.revealed, [action.id]: true } };

    case "SET_AUTO_PROCEED":
      return { ...state, autoProceed: action.value };

    case "ADD_LOG": {
      const entry = action.entry;
      const at = entry.key ? state.log.findIndex((e) => e.key === entry.key) : -1;
      const log = at >= 0 ? state.log.map((e, i) => (i === at ? entry : e)) : [...state.log, entry];
      return { ...state, log };
    }

    case "SET_SESSION_ID":
      return { ...state, sessionId: action.id };
    case "SET_STUDY_DESIGN_GATE":
      return { ...state, studyDesignGate: action.data };
    case "SET_G4_GATE":
      return { ...state, g4Gate: action.data };
    case "SET_G6_GATE":
      return { ...state, g6Gate: action.data };
    case "SET_G8_GATE":
      return { ...state, g8Gate: action.data };
    case "SET_G9_GATE":
      return { ...state, g9Gate: action.data };
    case "SET_DA_GATE":
      return { ...state, daGate: action.data };
    case "SET_SYNTHESIS_GATE":
      return { ...state, synthesisGate: action.data };

    case "GO_PAGE": {
      const idx = pageIndex(action.id);
      if (idx < 0 || idx > state.unlocked) return state;
      return { ...state, currentPage: action.id };
    }
    case "UNLOCK": {
      const idx = pageIndex(action.id);
      if (idx < 0) return state;
      return { ...state, unlocked: Math.max(state.unlocked, idx) };
    }

    default:
      return state;
  }
}

export const lastPage = PAGES[PAGES.length - 1].id;
