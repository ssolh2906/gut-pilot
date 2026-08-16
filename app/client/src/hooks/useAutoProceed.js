// useAutoProceed.js — shared by every gated page to implement the Upload
// page's "proceed with recommended options" toggle.
//
// This intentionally does NOT skip past gates or fake a result: it calls the
// exact same confirm/approve/continue handler a human clicking through the
// page would call, so the recommended option still goes through the same
// per-gate call path (today: the reducer action + decision-log entry; once
// a real backend exists: the same per-gate API request that fetches the
// reviewer's recommendation). Auto-proceed only removes the wait for a
// click — in a real deployment where each gate's recommendation comes back
// from an async AI call, `ready` is what should gate this, not a timer.
import { useEffect } from "react";
import { useAppState } from "../state/AppStateContext";

// `ready` — true once this page's recommended answer is available to accept
// (usually just `true`, since defaults are already loaded; a page waiting on
// something else, like a prior reveal, can pass that condition instead).
// `onProceed` — the same function the page's own button/click handler calls.
export function useAutoProceed(ready, onProceed) {
  const { state } = useAppState();
  useEffect(() => {
    if (state.autoProceed && ready) onProceed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.autoProceed, ready]);
}
