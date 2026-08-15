// FloatingChat.jsx — the single persistent way to talk to the reviewer.
// Mounted once at the app root (see App.jsx) so it survives page
// navigation: a launcher button bottom-right, and a chat panel that opens
// above it. Replaces the mock's per-page "ask" boxes and embedded AI docks
// with one conversation.
//
// There's no backend yet — sending a message shows a stub reply rather
// than a fake domain-specific answer. Once the FastAPI + Claude SDK
// backend exists (with the Paperclip skill for literature lookups), the
// stub in `getReply` is the one place that needs to change.
import { useEffect, useRef, useState } from "react";

const QUICK_PROMPTS = [
  "Flag low-depth samples",
  "Check for kit contamination",
  "Compare Healthy against CRC",
  "Recommend a rarefaction depth",
];

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 4h16v12H8l-4 4V4Z" strokeLinejoin="round" />
  </svg>
);
const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SendIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17 3 9 11m8-8-5.5 15-3-6.5L2 13.5 17 3Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

let nextId = 1;

function getReply() {
  return "I'm not connected to a live backend yet — once the reviewer is wired up (FastAPI + the Claude SDK, using Paperclip for literature lookups), I'll answer from this run's actual data instead of this placeholder.";
}

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typing]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function send(text) {
    const t = text.trim();
    if (!t || typing) return;
    setMessages((m) => [...m, { id: nextId++, role: "me", text: t }]);
    setValue("");
    setTyping(true);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: nextId++, role: "ai", text: getReply() }]);
    }, reduce ? 80 : 700);
  }

  return (
    <>
      <div className={"chat-panel" + (open ? " open" : "")} role="dialog" aria-label="Ask the reviewer" aria-modal="false">
        <div className="chat-panel-head">
          <div>
            <b>Ask the reviewer</b>
            <span>Questions about this run</span>
          </div>
        </div>

        <div className="chat-panel-body" ref={bodyRef}>
          {messages.length === 0 ? (
            <>
              <p className="chat-empty">
                Ask about the data, a decision the reviewer made, or what to check next. This is a placeholder for now —
                real answers come once the backend is connected.
              </p>
              <div className="chips dock-chips">
                {QUICK_PROMPTS.map((p) => (
                  <button key={p} type="button" className="chip" onClick={() => send(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={"bub " + m.role}>
                {m.text}
              </div>
            ))
          )}
          {typing && (
            <div className="bub ai">
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
        </div>

        <div className="chat-row">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(value);
            }}
            placeholder="Ask a question…"
            aria-label="Ask the reviewer"
          />
          <button type="button" className="chat-send" disabled={!value.trim() || typing} onClick={() => send(value)} aria-label="Send">
            <SendIcon />
          </button>
        </div>
      </div>

      <button
        type="button"
        className="chat-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Ask the reviewer"}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDownIcon /> : <ChatIcon />}
      </button>
    </>
  );
}
