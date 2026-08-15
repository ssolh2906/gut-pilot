// DecisionLog.jsx — the running record of every reviewer call and every
// human override, ported from the mock's drawer + timeline. `LogTimeline`
// renders the entries (shared by the drawer here and, later, the Summary
// page). `DecisionLogDrawer` is the slide-over panel opened from the
// masthead button.
import { refLink, refShort, PAGE_LABEL } from "../lib/data";
import { download, toCsv } from "../lib/exportUtils";

export function logToCsvRows(log) {
  return [["order", "page", "decision", "confidence", "source", "doi"]].concat(
    log.map((e, i) => [
      i + 1,
      PAGE_LABEL[e.page],
      e.text,
      e.human ? "human approval" : e.conf != null ? e.conf + "%" : "",
      e.ref ? refShort(e.ref) : e.src || "",
      e.ref ? (refLink(e.ref) ? refLink(e.ref).replace("https://doi.org/", "") : "") : "",
    ])
  );
}

export function downloadLogCsv(log) {
  download("decision-log.csv", toCsv(logToCsvRows(log)), "text/csv;charset=utf-8");
}

export function LogTimeline({ entries }) {
  if (!entries.length) {
    return <p style={{ color: "var(--color-ink-3)", fontSize: "12.5px", padding: "14px 0" }}>Upload a table to start the log.</p>;
  }
  return (
    <ol className="timeline">
      {entries.map((e, i) => {
        const link = e.ref ? refLink(e.ref) : null;
        return (
          <li className={"tl" + (e.human ? " human" : "")} key={i}>
            <div className="st">{PAGE_LABEL[e.page]}</div>
            <p>{e.text}</p>
            <div className="r2">
              {e.human ? (
                <span className="conf ok">APPROVED</span>
              ) : e.conf != null ? (
                <span className="conf">{e.conf}%</span>
              ) : null}
              {e.ref ? (
                link ? (
                  <a className="cite" href={link} target="_blank" rel="noopener noreferrer">
                    {refShort(e.ref)} ↗
                  </a>
                ) : (
                  <span className="cite" style={{ color: "var(--color-ink-3)" }}>
                    {refShort(e.ref)}
                  </span>
                )
              ) : e.src ? (
                <span className="cite" style={{ color: "var(--color-ink-3)" }}>
                  {e.src}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const CloseIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
  </svg>
);

export default function DecisionLogDrawer({ open, onClose, log }) {
  return (
    <>
      <div className={"scrim" + (open ? " on" : "")} onClick={onClose} />
      <aside className={"drawer" + (open ? " open" : "")} role="dialog" aria-label="Decision log" aria-modal="false">
        <div className="drawer-head">
          <h3>Decision log</h3>
          <button className="icon-btn" aria-label="Close decision log" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="drawer-body">
          <LogTimeline entries={log} />
        </div>
        <div className="drawer-foot">
          <button className="btn btn-sm" style={{ width: "100%" }} onClick={() => downloadLogCsv(log)}>
            Download log as CSV
          </button>
        </div>
      </aside>
    </>
  );
}
