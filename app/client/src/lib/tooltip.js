// tooltip.js — builds the small HTML fragment shown inside the shared
// floating tooltip. Spec format (ported from the mock):
//   "Title|key=value|key=value|!warning line"
// A leading "!" marks a note line (rendered in warning color) instead of
// a key/value row. Every chart element that wants a tooltip sets this
// string on a `data-tip` attribute; see components/Tooltip.jsx for the
// delegated listener that reads it.
export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function tipHTML(spec) {
  const parts = spec.split("|");
  let html = "<b>" + esc(parts[0]) + "</b>";
  parts.slice(1).forEach((p) => {
    if (p.startsWith("!")) {
      html += '<div class="note">' + esc(p.slice(1)) + "</div>";
      return;
    }
    const i = p.indexOf("=");
    if (i < 0) {
      html += '<div class="kv"><span>' + esc(p) + "</span></div>";
      return;
    }
    html += '<div class="kv"><span>' + esc(p.slice(0, i)) + "</span><span>" + esc(p.slice(i + 1)) + "</span></div>";
  });
  return html;
}
