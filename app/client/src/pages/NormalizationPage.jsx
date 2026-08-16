// NormalizationPage.jsx — data-page="rarefy" in the mock. Gate G6
// (normalization strategy) wired to the real backend: Compute produces the
// retention numbers, Claude verifies citations live via Paperclip and
// writes the debate positions + gate note. See app/server/reasoning/g6_normalization.py
// for the other side of this contract.
//
// The GET call is a live Claude + Paperclip round trip (tens of seconds,
// real tokens) — it only fires from the Reveal button, never automatically,
// and the result is cached in AppState (g6Gate) so navigating away and back
// doesn't re-trigger it. Picking a different strategy updates the UI purely
// client-side (every option's retention_preview already came back in the
// first fetch); only clicking "Confirm strategy" hits the backend again
// (also a real, billed Claude call), which is also when cascading effects
// on later gates (G7/G9) are checked.
//
// The rarefaction curve chart, depth slider, and "Reviewer proposal" note
// below cover G7 (rarefaction depth) — client-side only for now, no G7
// backend yet — shown once "Rarefaction" is the selected strategy.
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useAutoProceed } from "../hooks/useAutoProceed";
import { getNormalizeStrategy, setNormalizeStrategy, setRarefactionDepth, getQcDepth } from "../lib/api";
import Reveal from "../components/Reveal";
import { Opt, OptRow, GateNote, ConfBadge } from "../components/Gate";
import { fmt, refLink, refShort } from "../lib/data";

const STRATEGY_LABEL = { rarefy: "Rarefaction", css: "CSS scaling", clr: "CLR transform" };
const SIDE_LABEL = { for: "For rarefaction", against: "Against rarefaction", third: "Third position" };

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3l1.8 4.3L18 9l-4.2 1.7L12 15l-1.8-4.3L6 9l4.2-1.7L12 3Z" strokeLinejoin="round" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" strokeLinejoin="round" />
  </svg>
);

export default function NormalizationPage() {
  const { state, actions } = useAppState();
  const gate = state.g6Gate;
  const { threshold } = state;
  const [depthData, setDepthData] = useState(null);
  const [recommendedDepth] = useState(threshold);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(gate?.strategy ?? null);
  const [confirming, setConfirming] = useState(false);
  const [cascades, setCascades] = useState(null);
  const [autoFetchStarted, setAutoFetchStarted] = useState(false);
  // Tracks whether "Confirm strategy" has actually succeeded at least once
  // for the *currently selected* strategy. Kept separate from
  // hasPendingChange below: right after fetchGate, selected already equals
  // gate.strategy (the session's current default), which would otherwise
  // make hasPendingChange false and "Approve and compute" wrongly enabled
  // before any confirm ever ran — including auto-proceed silently skipping
  // the confirm step (and its real, billed Claude call) entirely.
  const [confirmedOnce, setConfirmedOnce] = useState(false);

  const rare = selected === "rarefy";
  useEffect(() => {
    if (!state.sessionId) return;
    let active = true;
    getQcDepth(state.sessionId).then((data) => { if (active) setDepthData(data); }).catch(() => {});
    return () => { active = false; };
  }, [state.sessionId]);

  const comparisonSamples = useMemo(
    () => (depthData?.bars ?? []).filter((sample) => sample.group === "H" || sample.group === "CRC"),
    [depthData],
  );
  const retainedSamples = useMemo(
    () => comparisonSamples.filter((sample) => sample.depth >= threshold),
    [comparisonSamples, threshold],
  );

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
      // Keeps state.normStrategy/betaMetric (R2) in sync for pages that
      // still read the reducer directly (e.g. the beta metric default).
      actions.setNormStrategy(selected);
      setCascades(data.cascades);
      setConfirmedOnce(true);
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
  const canProceed = !!gate && confirmedOnce && !hasPendingChange;

  useEffect(() => {
    if (state.autoProceed && state.sessionId && !gate && !autoFetchStarted) {
      setAutoFetchStarted(true);
      fetchGate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.autoProceed, state.sessionId, gate, autoFetchStarted]);

  async function approve() {
    if (rare && state.sessionId) {
      try {
        await setRarefactionDepth(state.sessionId, threshold);
      } catch (e) {
        setError(`Could not apply the depth: ${e.message}`);
        return;
      }
    }
    actions.addLog({
      key: "rarefyApprove",
      page: "rarefy",
      human: true,
      src: "human-in-the-loop",
      text: rare
        ? `Depth approved at ${fmt(threshold)} reads per sample. ${retainedSamples.length}/${comparisonSamples.length} H/CRC samples retained.`
        : `${STRATEGY_LABEL[gate.strategy]} approved. All comparison samples retained.`,
    });
    actions.advanceTo("alpha");
  }

  useAutoProceed(!!gate && !confirmedOnce && !confirming, confirmStrategy);
  useAutoProceed(canProceed, approve);

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
          subtitle="An evidence-grounded reviewer call with citation verification when the live provider is available"
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
        <>
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
                  <Opt
                    key={opt.option_id}
                    pressed={selected === opt.option_id}
                    recommended={opt.option_id === gate.recommendation.option_id}
                    onClick={() => setSelected(opt.option_id)}
                    title={opt.label}
                  >
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
                <button type="button" className="btn btn-primary btn-sm" disabled={confirming || (confirmedOnce && !hasPendingChange)} onClick={confirmStrategy}>
                  {confirming ? "Confirming…" : "Confirm strategy"}
                </button>
              </div>
            </div>
          </div>

          {rare && (
            <div className="agent">
              <div className="av">
                <SparkleIcon />
              </div>
              <div>
                <h4>Reviewer proposal</h4>
                <p>
                  The data-derived proposal is <span className="mono font-semibold">{fmt(recommendedDepth)} reads per sample</span>. It is the highest 100-read threshold that retains at least 85% of both H and CRC while keeping the retention-rate gap within 15 percentage points. Diversity uses repeated subsampling at this depth; differential abundance restarts from filtered relative abundances instead of reusing a rarefied matrix.
                </p>
                <div className="meta">
                  <a className="cite" href={refLink("schloss2024")} target="_blank" rel="noopener noreferrer">
                    {refShort("schloss2024")}, mSphere ↗
                  </a>
                  <a className="cite" href={refLink("subrata2024")} target="_blank" rel="noopener noreferrer">
                    {refShort("subrata2024")} ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {rare && (
            <div className="block">
              <div className="block-head"><div><h2>Real cohort retention</h2><p className="sub">The slider is evaluated against all uploaded H and CRC sample depths.</p></div></div>
              <div className="block-body">
                <div className="slider-read"><span className="v">{fmt(threshold)}</span><span className="u">reads / sample</span></div>
                <input type="range" min={500} max={10000} step={100} value={threshold} aria-label="Rarefaction depth" onChange={(event) => actions.setThreshold(+event.target.value)} />
                <div className="scale"><span>500</span><span>10,000</span></div>
                <div className="pv-strip mt-4">
                  <div className="pv"><span className="l">Retained total</span><span className="v">{retainedSamples.length}/{comparisonSamples.length || "…"}</span></div>
                  <div className="pv"><span className="l">Healthy</span><span className="v">{retainedSamples.filter((sample) => sample.group === "H").length}/{comparisonSamples.filter((sample) => sample.group === "H").length || "…"}</span></div>
                  <div className="pv"><span className="l">CRC</span><span className="v">{retainedSamples.filter((sample) => sample.group === "CRC").length}/{comparisonSamples.filter((sample) => sample.group === "CRC").length || "…"}</span></div>
                  <div className="pv"><span className="l">Excluded</span><span className="v">{comparisonSamples.length ? comparisonSamples.length - retainedSamples.length : "…"}</span></div>
                </div>
                <button type="button" className="btn btn-sm mt-3" onClick={() => actions.setThreshold(recommendedDepth)}>Reset to data-derived proposal ({fmt(recommendedDepth)})</button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="page-foot">
        <p className="hint">
          {!gate
            ? "Alpha diversity is next. This choice — and any exclusions it makes — carries into every later page."
            : rare
              ? "Approving records the threshold in the decision log and locks it in for every downstream panel."
              : "Approving records this choice in the decision log."}
        </p>
        <button type="button" className="btn btn-primary btn-lg" disabled={!canProceed} onClick={approve}>
          {gate ? `Approve ${rare ? fmt(threshold) : STRATEGY_LABEL[gate.strategy]} and compute` : "Approve and compute"}
        </button>
      </div>
    </section>
  );
}
