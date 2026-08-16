// DecisionLog.jsx — the running record of every reviewer call and every
// human override, ported from the mock's drawer + timeline. `LogTimeline`
// renders the entries (shared by the drawer here and, later, the Summary
// page). `DecisionLogDrawer` is the slide-over panel opened from the
// masthead button.
import { refLink, refShort, PAGE_LABEL } from "../lib/data";
import { download, toCsv } from "../lib/exportUtils";

// Reviewer (AI) proposal vs. a human-approved/overridden decision — same
// blue/green the rest of the app already uses for this distinction (see
// .conf/.agent), just as an icon badge instead of a plain colour dot.
const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3l1.8 4.3L18 9l-4.2 1.7L12 15l-1.8-4.3L6 9l4.2-1.7L12 3Z" strokeLinejoin="round" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" strokeLinejoin="round" />
  </svg>
);
const HumanIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c1.1-3.8 4-5.8 7-5.8s5.9 2 7 5.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
            <span className="tl-icon" aria-hidden="true">
              {e.human ? <HumanIcon /> : <SparkleIcon />}
            </span>
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
const LogIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M4 5h12M4 10h12M4 15h8" strokeLinecap="round" />
  </svg>
);

// The always-visible collapsed section on the right edge — a thin strip
// showing one small icon per log entry (blue sparkle for the reviewer,
// green human icon for a human approval), so the mix of AI vs. human
// decisions is visible at a glance without opening anything. Click (or
// Enter/Space) expands into the same DecisionLogDrawer below. It's a <div>
// with button semantics layered on rather than a <button>, since visually
// it reads as a persistent panel, not a control.
export function DecisionLogRail({ log, onClick }) {
  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }
  return (
    <div className="log-rail" role="button" tabIndex={0} aria-haspopup="dialog" aria-label={`Open decision log (${log.length} entries)`} onClick={onClick} onKeyDown={onKeyDown}>
      <LogIcon />
      <div className="log-rail-list">
        {log.map((e, i) => (
          <span key={i} className={"log-rail-dot" + (e.human ? " human" : "")} aria-hidden="true">
            {e.human ? <HumanIcon /> : <SparkleIcon />}
          </span>
        ))}
      </div>
    </div>
  );
}

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
