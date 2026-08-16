// Gate.jsx — small building blocks reused by every decision gate (Design,
// Rarefaction, Alpha significance, Beta metric, DA prevalence): a row of
// selectable option buttons, and the note that explains the reviewer's
// reasoning below them. Each page composes these inside its own
// `.block.gate` container rather than sharing one rigid gate component,
// since gate layouts differ enough (tables, sliders, debate boxes) that a
// single wrapper would fight more than it'd help.

export function OptRow({ children, columns }) {
  const style = columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined;
  return (
    <div className="opt-row" style={style}>
      {children}
    </div>
  );
}

// `recommended` marks the option the reviewer's Reasoning layer picked
// (gate.recommendation.option_id from the backend) with a distinct outline,
// independent of `pressed` (the user's current selection) - the two can
// differ, e.g. right after a gate loads before the user has changed anything
// they're the same option, but they diverge the moment the user picks something else.
export function Opt({ pressed, recommended, disabled, onClick, title, children }) {
  const cls = "opt" + (recommended ? " opt-recommended" : "");
  return (
    <button type="button" className={cls} aria-pressed={String(!!pressed)} disabled={disabled} onClick={onClick}>
      <b>{title}</b>
      <span>{children}</span>
    </button>
  );
}

// `html` is a pre-built string (may contain <b>, <span class="mono">, ...)
// because the reviewer's explanations are generated with inline emphasis —
// same approach the mock used. Content is always app-generated, never
// user-supplied, so this is safe.
export function GateNote({ html, variant, className = "" }) {
  if (!html) return null;
  const cls = "gate-note" + (variant ? " " + variant : "") + (className ? " " + className : "");
  return <div className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ConfBadge({ children, variant }) {
  return <span className={"conf" + (variant ? " " + variant : "")}>{children}</span>;
}
