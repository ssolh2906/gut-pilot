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

export function sanitizeReviewerHtml(value) {
  if (typeof value !== "string") return "";
  const tags = [];
  const tokenized = value.replace(/<\/?b>|<span class=(['"])mono\1>|<\/span>/gi, (tag) => {
    let safeTag;
    if (/^<b>$/i.test(tag)) safeTag = "<b>";
    else if (/^<\/b>$/i.test(tag)) safeTag = "</b>";
    else if (/^<\/span>$/i.test(tag)) safeTag = "</span>";
    else safeTag = '<span class="mono">';
    tags.push(safeTag);
    return `\uE000${tags.length - 1}\uE001`;
  });
  return tokenized
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\uE000(\d+)\uE001/g, (_, index) => tags[Number(index)]);
}

// Reviewer explanations may contain inline emphasis. Only the two explicit
// formatting forms in the gate contract survive; every other tag and every
// attribute is escaped before insertion.
export function GateNote({ html, variant, className = "" }) {
  if (!html) return null;
  const cls = "gate-note" + (variant ? " " + variant : "") + (className ? " " + className : "");
  return <div className={cls} dangerouslySetInnerHTML={{ __html: sanitizeReviewerHtml(html) }} />;
}

export function ConfBadge({ children, variant }) {
  return <span className={"conf" + (variant ? " " + variant : "")}>{children}</span>;
}
