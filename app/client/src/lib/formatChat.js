// formatChat.js — a small, safe markdown-lite renderer for the reviewer's
// chat replies: **bold**, `code`, and short "- " bullet lists (see the
// formatting rules in reasoning/chatbot.py's system prompt — the two must
// stay in sync). The raw text is HTML-escaped FIRST, then a narrow
// whitelist of substitutions wraps matched spans in fixed safe tags — the
// model can never inject a real tag this way, since any literal "<"/">" it
// types is already escaped before the substitutions run. This one is worth
// being careful about: unlike every other dangerouslySetInnerHTML in this
// app (GateNote, etc.), which renders app-authored copy, this renders live
// model output.

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInline(line) {
  return line.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+?)`/g, "<code>$1</code>");
}

export function formatChatReply(text) {
  const lines = escapeHtml(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks = [];
  let currentList = null;
  for (const line of lines) {
    if (line.startsWith("- ")) {
      if (!currentList) {
        currentList = [];
        blocks.push(currentList);
      }
      currentList.push(formatInline(line.slice(2)));
    } else {
      currentList = null;
      blocks.push(formatInline(line));
    }
  }

  return blocks.map((b) => (Array.isArray(b) ? `<ul>${b.map((item) => `<li>${item}</li>`).join("")}</ul>` : b)).join("<br/>");
}
