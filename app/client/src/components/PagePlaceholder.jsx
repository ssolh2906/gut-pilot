// PagePlaceholder.jsx — temporary stand-in for a page's real content, shown
// until its gates/charts are built (see the work order in the frontend
// plan). Keeps the page's real title/lede in place and provides a "Continue"
// button so the whole 8-page flow is click-through-able for review before
// every page has real content.
// TODO: replace per page, in work-order sequence, with the real gate/chart content.
import { useAppState } from "../state/AppStateContext";

export default function PagePlaceholder({ title, lede, nextId, nextLabel }) {
  const { actions } = useAppState();
  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="lede">{lede}</p>
        </div>
      </div>

      <div className="block">
        <div className="block-body pad-t text-sm text-ink-2">Page content not built yet.</div>
      </div>

      {nextId && (
        <div className="page-foot">
          <p className="hint">Placeholder page — stands in until this page's gates and charts are built.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => actions.advanceTo(nextId)}>
            {nextLabel}
          </button>
        </div>
      )}
    </section>
  );
}
