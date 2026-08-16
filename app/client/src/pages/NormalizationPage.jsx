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
import { useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useAutoProceed } from "../hooks/useAutoProceed";
import { getNormalizeStrategy, setNormalizeStrategy } from "../lib/api";
import { retained } from "../state/selectors";
import Reveal from "../components/Reveal";
import { Opt, OptRow, GateNote, ConfBadge } from "../components/Gate";
import ChartTools from "../components/ChartTools";
import { scaleLinear, tickFractions } from "../components/charts/chartHelpers";
import { samples, richnessAt, THRESH_DEFAULT, fmt, groupName, groupColor, refLink, refShort } from "../lib/data";

const STRATEGY_LABEL = { rarefy: "Rarefaction", css: "CSS scaling", clr: "CLR transform" };
const SIDE_LABEL = { for: "For rarefaction", against: "Against rarefaction", third: "Third position" };

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3l1.8 4.3L18 9l-4.2 1.7L12 15l-1.8-4.3L6 9l4.2-1.7L12 3Z" strokeLinejoin="round" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" strokeLinejoin="round" />
  </svg>
);

const W = 900,
  H = 320,
  L = 58,
  R = 18,
  T = 16,
  B = 40;

function RareChart({ svgRef, threshold }) {
  const pw = W - L - R;
  const ph = H - T - B;
  const maxD = Math.max(...samples.map((s) => s.depth));
  const maxR = Math.max(...samples.map((s) => s.rMax)) * 1.05;
  const x = scaleLinear(0, maxD, L, L + pw);
  const y = scaleLinear(0, maxR, T + ph, T);
  const steps = 28;

  return (
    <div className="plot wide">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rarefaction curves">
        {tickFractions(4).map((f) => {
          const yy = T + ph - f * ph;
          const xx = L + f * pw;
          return (
            <g key={f}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} className="gl" />
              <text x={L - 8} y={yy + 3.5} textAnchor="end" fontSize="10">
                {Math.round(maxR * f)}
              </text>
              <text x={xx} y={H - B + 16} textAnchor="middle" fontSize="10">
                {fmt(Math.round(maxD * f))}
              </text>
            </g>
          );
        })}

        {samples.map((s) => {
          let d = "";
          for (let i = 0; i <= steps; i++) {
            const dd = (s.depth * i) / steps;
            d += (i ? "L" : "M") + x(dd).toFixed(1) + " " + y(richnessAt(s, dd)).toFixed(1) + " ";
          }
          const out = s.depth < threshold;
          return (
            <path
              key={s.id}
              d={d}
              className={"curve" + (out ? " out" : "")}
              stroke={groupColor(s.group)}
              data-tip={`${s.id}|group=${groupName(s.group)}|max depth=${fmt(s.depth)} reads|plateau richness=${s.rMax.toFixed(0)}|richness at ${fmt(threshold)}=${richnessAt(s, Math.min(threshold, s.depth)).toFixed(1)}${out ? "|!Excluded at the current threshold" : ""}`}
            />
          );
        })}

        <line x1={x(threshold)} x2={x(threshold)} y1={T} y2={H - B} stroke="var(--color-ink-0)" strokeWidth="1.4" strokeDasharray="5 3" />
        <text x={x(threshold) + 6} y={T + 12} fontSize="10" fill="var(--color-ink-1)" fontWeight="700">
          {fmt(threshold)}
        </text>

        <line x1={L} x2={L} y1={T} y2={H - B} className="ax" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="ax" />
        <text x={W - R} y={H - 8} textAnchor="end" fontSize="10">
          reads sampled →
        </text>
        <text x="16" y={T + ph / 2} textAnchor="middle" fontSize="10" transform={`rotate(-90 16 ${T + ph / 2})`}>
          observed genera
        </text>
      </svg>
    </div>
  );
}

export default function NormalizationPage() {
  const { state, actions } = useAppState();
  const gate = state.g6Gate;
  const { threshold } = state;
  const svgRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(gate?.strategy ?? null);
  const [confirming, setConfirming] = useState(false);
  const [cascades, setCascades] = useState(null);
  // Tracks whether "Confirm strategy" has actually succeeded at least once
  // for the *currently selected* strategy. Kept separate from
  // hasPendingChange below: right after fetchGate, selected already equals
  // gate.strategy (the session's current default), which would otherwise
  // make hasPendingChange false and "Approve and compute" wrongly enabled
  // before any confirm ever ran — including auto-proceed silently skipping
  // the confirm step (and its real, billed Claude call) entirely.
  const [confirmedOnce, setConfirmedOnce] = useState(false);

  const rare = selected === "rarefy";
  const kept = retained(state);

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

  function approve() {
    actions.addLog({
      key: "rarefyApprove",
      page: "rarefy",
      human: true,
      src: "human-in-the-loop",
      text: rare
        ? `Depth approved at ${fmt(threshold)} reads per sample. ${kept.length} samples retained, ${samples.length - kept.length} excluded.`
        : `${STRATEGY_LABEL[gate.strategy]} approved. All ${samples.length} samples retained.`,
    });
    actions.advanceTo("alpha");
  }

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
                <button type="button" className="btn btn-primary btn-sm" disabled={confirming || !hasPendingChange} onClick={confirmStrategy}>
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
                  I picked <span className="mono font-semibold">{fmt(THRESH_DEFAULT)} reads per sample</span> because rarefaction curves plateau for 22 of 24 samples by that depth, and Schloss (2024)
                  found that rarefaction, meaning repeated subsampling rather than single-pass rarefying, gives the highest statistical power for alpha and beta diversity when depth is uneven across
                  groups. Two samples (<span className="mono">H-09</span>, <span className="mono">C-04</span>) stay below the line and are excluded, rather than forcing the whole cohort down to their
                  depth.
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
            <div className="rare-grid">
              <div className="block">
                <div className="block-head">
                  <div>
                    <h2>Rarefaction curves</h2>
                    <p className="sub">Vertical line is the current threshold. Dimmed curves are excluded at that depth. Hover a curve for its plateau.</p>
                  </div>
                  <ChartTools svgRef={svgRef} name="rarefaction-curves" getCsvRows={() => [["sample", "group", "depth", "retained"], ...samples.map((s) => [s.id, groupName(s.group), s.depth, s.depth >= threshold ? "yes" : "no"])]} />
                </div>
                <div className="block-body">
                  <RareChart svgRef={svgRef} threshold={threshold} />
                  <div className="legend">
                    <div className="lg line">
                      <i style={{ background: "var(--color-cat-1)" }} />
                      Healthy
                    </div>
                    <div className="lg line">
                      <i style={{ background: "var(--color-cat-8)" }} />
                      CRC
                    </div>
                    <div className="lg line">
                      <i style={{ background: "var(--color-ink-3)" }} />
                      Excluded at current depth
                    </div>
                  </div>
                </div>
              </div>

              <div className="block">
                <div className="block-head">
                  <div>
                    <h3>Threshold</h3>
                  </div>
                </div>
                <div className="block-body">
                  <div className="slider-read">
                    <span className="v">{fmt(threshold)}</span>
                    <span className="u">reads / sample</span>
                  </div>
                  <input type="range" min={500} max={10000} step={50} value={threshold} aria-label="Rarefaction depth" onChange={(e) => actions.setThreshold(+e.target.value)} />
                  <div className="scale">
                    <span>500</span>
                    <span>10,000</span>
                  </div>
                  <div className="retain">
                    <b>{kept.length} of {samples.length}</b> samples retained
                    <br />
                    Healthy {kept.filter((s) => s.group === "H").length} against CRC {kept.length - kept.filter((s) => s.group === "H").length}
                  </div>
                  <div className="sids">
                    {samples.map((s) => {
                      const out = s.depth < threshold;
                      return (
                        <div key={s.id} className={"sid" + (out ? " out" : "")} data-tip={`${s.id}|group=${groupName(s.group)}|reads=${fmt(s.depth)}${out ? "|!Excluded" : ""}`}>
                          <i style={{ background: groupColor(s.group) }} />
                          {s.id}
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className="btn btn-sm mt-3 w-full" onClick={() => actions.setThreshold(THRESH_DEFAULT)}>
                    Reset to proposal ({fmt(THRESH_DEFAULT)})
                  </button>
                </div>
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
