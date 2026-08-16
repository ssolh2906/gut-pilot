// NormalizationPage.jsx — data-page="rarefy" in the mock. Gate G6
// (normalization strategy) wired to the real backend: Compute produces the
// retention numbers, Claude verifies citations live via Paperclip and
// writes the debate positions + gate note. See app/server/reasoning/g6_normalization.py
// for the other side of this contract, and docs/gates/G6.md for the spec.
//
// The GET call is a live Claude + Paperclip round trip (tens of seconds,
// real tokens) — it only fires from the Reveal button, never automatically,
// and the result is cached in AppState (g6Gate) so navigating away and back
// doesn't re-trigger it. Picking a different strategy updates the UI purely
// client-side (every option's retention_preview already came back in the
// first fetch); only clicking "Confirm strategy" hits the backend again,
// which is also when cascading effects on later gates (G7/G9) are checked.
//
// TODO: rarefaction curves + depth slider (G7) - only reachable when this
// gate's strategy is "rarefy" - aren't built yet; this page currently only
// covers G6.
import { useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { getNormalizeStrategy, setNormalizeStrategy } from "../lib/api";
import Reveal from "../components/Reveal";
import { Opt, OptRow, GateNote, ConfBadge } from "../components/Gate";

const STRATEGY_LABEL = { rarefy: "Rarefaction", css: "CSS scaling", clr: "CLR transform" };
const SIDE_LABEL = { for: "For rarefaction", against: "Against rarefaction", third: "Third position" };

export default function NormalizationPage() {
  const { state, actions } = useAppState();
  const gate = state.g6Gate;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(gate?.strategy ?? null);
  const [confirming, setConfirming] = useState(false);
  const [cascades, setCascades] = useState(null);

  async function fetchGate() {
    if (!state.sessionId) {
      setError("No active session yet — go back to Upload first so the backend has a dataset loaded.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getNormalizeStrategy(state.sessionId);
      actions.setG6Gate(data);
      setSelected(data.strategy);
      actions.addLog({
        key: "g6-proposal",
        page: "rarefy",
        conf: 88,
        src: "reviewer",
        text: "Proposed a normalization strategy, weighing the rarefaction/CSS/CLR debate against this run's actual retention numbers.",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmStrategy() {
    if (!state.sessionId || !selected) return;
    setConfirming(true);
    setError(null);
    try {
      const data = await setNormalizeStrategy(state.sessionId, selected);
      actions.setG6Gate(data);
      setCascades(data.cascades);
      actions.addLog({
        key: "g6",
        page: "rarefy",
        human: true,
        src: "human-in-the-loop",
        text: `Normalization strategy set to ${STRATEGY_LABEL[selected]}.`,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirming(false);
    }
  }

  const hasPendingChange = gate && selected !== gate.strategy;

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Normalization</h1>
          <p className="lede">
            The literature genuinely splits here, so this page argues both sides before you pick. Everything downstream inherits the choice.
          </p>
        </div>
      </div>

      {!gate && !loading && (
        <Reveal
          title="Ask the reviewer for a recommendation"
          subtitle="A live call to Claude, grounded in citations it verifies via Paperclip — takes 30–60 seconds"
          stepLabel="step 1 of 1"
          onReveal={fetchGate}
        />
      )}

      {loading && (
        <div className="block appear">
          <div className="block-body pad-t text-sm text-ink-2">
            Reviewer is weighing the normalization debate against this run's data and verifying its citations live — this takes a little while.
          </div>
        </div>
      )}

      {error && (
        <div className="gate-note warn flex items-center gap-2.5">
          <span>{error}</span>
          <button type="button" className="btn btn-sm" onClick={fetchGate}>
            Retry
          </button>
        </div>
      )}

      {gate && (
        <div className="block gate appear">
          <div className="block-head">
            <div>
              <h2>Normalization strategy</h2>
              <p className="sub">
                Uneven depth has to be handled somehow. There is no consensus on which way is correct, and any tool that hides this choice is making it for you.
              </p>
            </div>
            <ConfBadge>{gate.recommendation.label}</ConfBadge>
          </div>
          <div className="block-body flex flex-col gap-3">
            <OptRow>
              {gate.options.map((opt) => (
                <Opt key={opt.option_id} pressed={selected === opt.option_id} onClick={() => setSelected(opt.option_id)} title={opt.label}>
                  {opt.summary}{" "}
                  <span className="font-mono">
                    ({opt.retention_preview.retained}/{opt.retention_preview.total} retained)
                  </span>
                </Opt>
              ))}
            </OptRow>

            <GateNote html={gate.note.message} variant={gate.note.severity === "warn" ? "warn" : undefined} />

            {cascades && cascades.length > 0 && (
              <div className="gate-note warn flex flex-col gap-1">
                {cascades.map((c, i) => (
                  <div key={i}>{c.message}</div>
                ))}
              </div>
            )}

            <div className="debate-box">
              {gate.positions.map((p) => (
                <div className="db-side" key={p.side}>
                  <span className="label">{SIDE_LABEL[p.side] ?? p.side}</span>
                  <p>{p.claim}</p>
                  {p.quote ? (
                    <blockquote className="border-l-2 border-line-2 pl-2.5 my-2 text-xs italic text-ink-2 leading-relaxed">
                      "{p.quote}"
                      <div className="not-italic font-mono text-[10px] text-ink-3 mt-1">{p.line_ref}, as read from the paper</div>
                    </blockquote>
                  ) : (
                    <p className="text-xs text-ink-3 italic my-2">No verified excerpt for this claim — grounded only in confirmed title/authorship.</p>
                  )}
                  <a className="text-xs font-mono" href={`https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer">
                    {p.ref_key} ↗
                  </a>
                </div>
              ))}
            </div>

            <div className="page-foot mt-1">
              <p className="hint">
                {hasPendingChange
                  ? `Selecting ${STRATEGY_LABEL[selected]} — confirm to record the decision and check for effects on later gates.`
                  : "This strategy is confirmed and logged."}
              </p>
              <button type="button" className="btn btn-primary btn-sm" disabled={confirming || !hasPendingChange} onClick={confirmStrategy}>
                {confirming ? "Confirming…" : "Confirm strategy"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-foot">
        <p className="hint">Alpha diversity is next. This choice — and any exclusions it makes — carries into every later page.</p>
        <button type="button" className="btn btn-primary btn-lg" disabled={!gate} onClick={() => actions.advanceTo("alpha")}>
          Approve and compute
        </button>
      </div>
    </section>
  );
}
