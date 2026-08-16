// useAutoProceed.js — shared by every gated page to implement the Upload
// page's "proceed with recommended options" toggle.
//
// This intentionally does NOT skip past gates or fake a result: it calls the
// exact same confirm/approve/continue handler a human clicking through the
// page would call, so the recommended option still goes through the same
// per-gate call path (today: the reducer action + decision-log entry; once
// a real backend exists: the same per-gate API request that fetches the
// reviewer's recommendation). `ready` is what should gate this in a real
// deployment where a gate's recommendation comes back from an async AI call.
//
// AUTO_PROCEED_DELAY_MS below is separate from that: it's a deliberate UX
// pause so auto-proceed reads as a pipeline stepping through each gate
// rather than a jump-cut to the end. Change this one constant to feel out
// a faster/slower pace.
import { useEffect } from "react";
import { useAppState } from "../state/AppStateContext";

export const AUTO_PROCEED_DELAY_MS = 700;

// `ready` — true once this page's recommended answer is available to accept
// (usually just `true`, since defaults are already loaded; a page waiting on
// something else, like a prior reveal, can pass that condition instead).
// `onProceed` — the same function the page's own button/click handler calls.
export function useAutoProceed(ready, onProceed) {
  const { state } = useAppState();
  useEffect(() => {
    if (!(state.autoProceed && ready)) return;
    const timer = setTimeout(onProceed, AUTO_PROCEED_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.autoProceed, ready]);
}
