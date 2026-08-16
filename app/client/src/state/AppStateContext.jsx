// AppStateContext.jsx — the one provider every page reads from. Wraps the
// reducer in `store.js` and exposes a small set of named actions so
// components call `actions.setFloor(6000)` instead of dispatching raw
// action objects, matching the mock's imperative function names
// (setFloor, setThreshold, renderGroups's manual toggle, ...) one-for-one.
import { createContext, useContext, useMemo, useReducer } from "react";
import { reducer, initialState } from "./store";
import { samples, PAGE_LABEL, FLOOR_DEFAULT } from "../lib/data";
import { PAGES, pageIndex } from "../lib/pages";

const AppStateCtx = createContext(null);

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // useCallback keeps these function identities stable across renders so
  // they're safe to drop in dependency arrays / memoized child props.
  const actions = useMemo(() => {
    const addLog = (entry) => dispatch({ type: "ADD_LOG", entry });

    return {
      dispatch,
      addLog,

      // ---- navigation ----
      goPage: (id) => dispatch({ type: "GO_PAGE", id }),
      unlock: (id) => dispatch({ type: "UNLOCK", id }),
      advanceTo: (id) => {
        dispatch({ type: "UNLOCK", id });
        dispatch({ type: "GO_PAGE", id });
        // Auto-proceed drives forward navigation only. Left on past the
        // last page, it would re-fire the moment any earlier (unlocked)
        // page is revisited — its useAutoProceed effect runs again on
        // mount and immediately advances again, which reads as pages
        // turning by themselves when the user is just trying to look back.
        // Reaching the end is the natural place to switch it back off.
        if (pageIndex(id) === PAGES.length - 1) {
          dispatch({ type: "SET_AUTO_PROCEED", value: false });
        }
      },

      // ---- design gates (G1-G4) ----
      setGroupSource: (source) => {
        // Switching back to "inferred" should undo any manual toggles, not
        // just relabel the current (possibly hand-edited) groups. The ID
        // prefix *is* the inferred rule, so resetting is just re-deriving
        // group from id rather than needing a separate stored "original".
        if (source === "inferred") {
          samples.forEach((s) => {
            s.group = s.id[0];
          });
          dispatch({ type: "BUMP_GROUP_VERSION" });
        }
        dispatch({ type: "SET_GROUP_SOURCE", source });
      },
      toggleSampleGroup: (id) => {
        const s = samples.find((x) => x.id === id);
        if (!s) return;
        s.group = s.group === "H" ? "C" : "H"; // mutate the shared singleton in place, like the mock
        dispatch({ type: "BUMP_GROUP_VERSION" });
      },
      setBatchHandling: (handling) => dispatch({ type: "SET_BATCH_HANDLING", handling }),
      setPairing: (pairing) => dispatch({ type: "SET_PAIRING", pairing }),
      setRank: (rank) => dispatch({ type: "SET_RANK", rank }),
      confirmDesign: () => dispatch({ type: "CONFIRM_DESIGN" }),

      // ---- QC depth floor (G5) ----
      setFloor: (value, { record } = {}) => {
        dispatch({ type: "SET_FLOOR", value });
        if (record && value !== FLOOR_DEFAULT) {
          addLog({
            key: "floor",
            page: "qc",
            human: true,
            src: "human-in-the-loop",
            text: `Reviewer set the QC depth floor to ${value.toLocaleString("en-US")} reads (default ${FLOOR_DEFAULT.toLocaleString("en-US")}).`,
          });
        }
      },

      // ---- rarefaction threshold ----
      setThreshold: (value) => dispatch({ type: "SET_THRESHOLD", value }),

      // ---- normalization (G6), significance (G8), beta metric (G9), prevalence (G10) ----
      setNormStrategy: (value) => dispatch({ type: "SET_NORM_STRATEGY", value }),
      setAlphaLevel: (value) => dispatch({ type: "SET_ALPHA_LEVEL", value }),
      setCorrection: (value) => dispatch({ type: "SET_CORRECTION", value }),
      setBetaMetric: (value) => dispatch({ type: "SET_BETA_METRIC", value }),
      setPrevFilter: (value) => dispatch({ type: "SET_PREV_FILTER", value }),
      setDaViewed: () => dispatch({ type: "SET_DA_VIEWED" }),

      // ---- progressive reveal ----
      reveal: (id) => dispatch({ type: "REVEAL", id }),

      // ---- proceed with recommended options ----
      setAutoProceed: (value) => {
        dispatch({ type: "SET_AUTO_PROCEED", value });
        if (value) {
          addLog({
            page: "upload",
            human: true,
            src: "human-in-the-loop",
            text: "Reviewer switched on auto-proceed: every remaining gate accepts the recommended option automatically.",
          });
        }
      },

      // ---- backend wiring ----
      setSessionId: (id) => dispatch({ type: "SET_SESSION_ID", id }),
      setStudyDesignGate: (data) => dispatch({ type: "SET_STUDY_DESIGN_GATE", data }),
      setG4Gate: (data) => dispatch({ type: "SET_G4_GATE", data }),
      setG6Gate: (data) => dispatch({ type: "SET_G6_GATE", data }),
      setG8Gate: (data) => dispatch({ type: "SET_G8_GATE", data }),
      setG9Gate: (data) => dispatch({ type: "SET_G9_GATE", data }),
      setDaGate: (data) => dispatch({ type: "SET_DA_GATE", data }),
      setSynthesisGate: (data) => dispatch({ type: "SET_SYNTHESIS_GATE", data }),
    };
  }, []);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <AppStateCtx.Provider value={value}>{children}</AppStateCtx.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateCtx);
  if (!ctx) throw new Error("useAppState must be used within an AppStateProvider");
  return ctx;
}

// Convenience re-export so pages don't need a second import for page labels.
export { PAGE_LABEL };
export { pageIndex };
