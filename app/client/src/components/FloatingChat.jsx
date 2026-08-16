// FloatingChat.jsx — the single persistent way to talk to the reviewer.
// Mounted once at the app root (see App.jsx) so it survives page
// navigation: a launcher button bottom-right, and a chat panel that opens
// above it. Replaces the mock's per-page "ask" boxes and embedded AI docks
// with one conversation.
//
// Every send is a real, billed Claude call (reasoning/chatbot.py on the
// backend, grounded in this session's decision log + gate state + whichever
// research/*.md doc covers the current page) — only fires from an explicit
// send action, never automatically, same cost-conscious pattern as the
// per-gate Reveal buttons.
import { useEffect, useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { sendChatMessage } from "../lib/api";
import { formatChatReply } from "../lib/formatChat";

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

// What the chatbot needs to know that only exists in the frontend reducer —
// several gates (G1-G3, the live G8/G9 pickers) have no backend apply_*/POST
// endpoint, so without sending this the chatbot answers from stale or
// absent backend state instead of what the user is actually looking at.
// See reasoning/chatbot.py's _client_state_block for the receiving side.
function buildClientState(state) {
  return {
    design: {
      groupSource: state.design.groupSource,
      confirmed: state.design.confirmed,
      singleCohort: state.design.singleCohort,
      batchHandling: state.design.batchHandling,
      pairing: state.design.pairing,
      selectedColumn: state.studyDesignGate?.g1?.selected_column ?? null,
      groupCounts: state.studyDesignGate?.g1?.group_counts ?? null,
      batchStatus: state.studyDesignGate?.g2?.status ?? null,
    },
    betaMetric: state.betaMetric,
    alphaLevel: state.alphaLevel,
    correction: state.correction,
    // The Summary page's synthesis is generated once client-side (see
    // RefsPage.jsx) and never written back to the backend session at all —
    // without this, the chatbot has no way to see it, even while it's the
    // exact thing on the user's screen.
    summary: state.synthesisGate
      ? {
          heroFinding: state.synthesisGate.hero_finding,
          summaryText: state.synthesisGate.summary_text,
          literatureValidationText: state.synthesisGate.literature_validation_text,
          limitations: state.synthesisGate.limitations,
          nextSteps: state.synthesisGate.next_steps,
        }
      : null,
  };
}

export default function FloatingChat() {
  const { state } = useAppState();
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

  async function send(text) {
    const t = text.trim();
    if (!t || typing) return;
    setValue("");

    if (!state.sessionId) {
      setMessages((m) => [
        ...m,
        { id: nextId++, role: "me", text: t },
        { id: nextId++, role: "ai", text: "No active run yet — start one from Upload first, then I can answer using its real data." },
      ]);
      return;
    }

    setMessages((m) => [...m, { id: nextId++, role: "me", text: t }]);
    setTyping(true);
    try {
      const { reply, in_scope } = await sendChatMessage(state.sessionId, t, state.currentPage, buildClientState(state));
      setMessages((m) => [...m, { id: nextId++, role: "ai", text: reply, inScope: in_scope !== false }]);
    } catch (e) {
      setMessages((m) => [...m, { id: nextId++, role: "ai", text: `Something went wrong reaching the reviewer: ${e.message}` }]);
    } finally {
      setTyping(false);
    }
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
                Ask about the data, a decision the reviewer made, or what to check next — grounded in this run's actual state. Scoped to this
                microbiome analysis and the science behind it, not general questions.
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
              <div key={m.id} className={"bub " + m.role + (m.role === "ai" && m.inScope === false ? " out-of-scope" : "")}>
                {m.role === "ai" ? (
                  <>
                    {m.inScope === false && <span className="bub-tag">Out of scope</span>}
                    <span dangerouslySetInnerHTML={{ __html: formatChatReply(m.text) }} />
                  </>
                ) : (
                  m.text
                )}
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
