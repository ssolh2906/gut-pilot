// NormalizationPage.jsx — data-page="rarefy" in the mock. Gate G6
// (normalization strategy) wired to the real backend: Compute produces the
// retention numbers, Claude verifies citations live via Paperclip and
// writes the debate positions + gate note. See app/server/reasoning/g6_normalization.py
// for the other side of this contract.
//
// The GET call is a live Claude + Paperclip round trip (tens of seconds,
// real tokens) — it runs automatically once a session exists (same pattern
// as the Design page), and the result is cached in AppState (g6Gate) so
// navigating away and back doesn't re-trigger it. Picking a different
// strategy updates the UI purely client-side (every option's
// retention_preview already came back in the first fetch); only clicking
// "Confirm strategy" hits the backend again (also a real, billed Claude
// call), which is also when cascading effects on later gates (G7/G9) are
// checked.
//
// The rarefaction curve chart, depth slider, and "Reviewer proposal" note
// below cover G7 (rarefaction depth) — real per-sample data from
// GET .../rarefaction/curves (exact expected richness + a plateau-derived
// suggested depth, see compute/p04_rarefaction.py), fetched once when
// "Rarefaction" becomes the selected strategy. Threshold changes after
// that are purely client-side (every sample's full curve + depth already
// came back in that one fetch), so the chart/slider/retained-count react
// instantly with no further network round trips.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useAutoProceed } from "../hooks/useAutoProceed";
import { getNormalizeStrategy, setNormalizeStrategy, getRarefactionCurves } from "../lib/api";
import { Opt, OptRow, GateNote, ConfBadge } from "../components/Gate";
import ChartTools from "../components/ChartTools";
import Spinner from "../components/Spinner";
import { scaleLinear, tickFractions } from "../components/charts/chartHelpers";
import { fmt, refLink, refShort } from "../lib/data";

const STRATEGY_LABEL = { rarefy: "Rarefaction", css: "CSS scaling", clr: "CLR transform" };
const SIDE_LABEL = { for: "For rarefaction", against: "Against rarefaction", third: "Third position" };

// Real group labels are whatever the dataset's metadata says (e.g. the
// crc_baxter DiseaseState column: "H" / "CRC" / "nonCRC"), not the mock's
// fixed two-group H/C — so colors/names are assigned on the fly, in a
// stable order, rather than hardcoded per label.
const GROUP_PALETTE = ["var(--color-cat-6)", "var(--color-cat-3)", "var(--color-cat-5)", "var(--color-cat-7)"];
// Keep the app's existing H=blue/CRC=red convention (every other page's
// mock data uses cat-1/cat-8 for these two) for the labels real datasets
// actually use; anything else falls back to the general palette above so
// an unfamiliar dataset's groups still get distinct, stable colors.
const GROUP_STYLE_OVERRIDE = {
  H: { color: "var(--color-cat-1)", name: "Healthy" },
  CRC: { color: "var(--color-cat-8)", name: "CRC" },
  nonCRC: { color: "var(--color-cat-4)", name: "non-CRC" },
};

function useGroupStyle(rareSamples) {
  return useMemo(() => {
    const labels = [...new Set(rareSamples.map((s) => s.group))].sort();
    const color = {};
    const name = {};
    let next = 0;
    labels.forEach((g) => {
      const override = GROUP_STYLE_OVERRIDE[g];
      color[g] = override ? override.color : GROUP_PALETTE[next++ % GROUP_PALETTE.length];
      name[g] = override ? override.name : g;
    });
    return { groupColor: (g) => color[g] ?? "var(--color-ink-3)", groupName: (g) => name[g] ?? g };
  }, [rareSamples]);
}

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

function richnessAtDepth(s, depth) {
  const curve = s.curve;
  if (depth <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (depth <= curve[i][0]) {
      const [d0, r0] = curve[i - 1];
      const [d1, r1] = curve[i];
      return d1 === d0 ? r1 : r0 + ((r1 - r0) * (depth - d0)) / (d1 - d0);
    }
  }
  return curve[curve.length - 1][1];
}

function RareChart({ svgRef, threshold, samples, groupColor, groupName, xMax }) {
  const pw = W - L - R;
  const ph = H - T - B;
  // xMax is capped to the cohort's typical depth range (see sliderMax in
  // the parent), not stretched to the single deepest outlier sample - a
  // real crc_baxter run has a couple of samples past 200k reads against a
  // median around 10k, and plotting to that outlier's max would squeeze
  // every other curve into a sliver on the left. Curves that run past
  // xMax just draw off the right edge of the fixed viewBox instead.
  const maxD = xMax;
  const maxR = Math.max(...samples.map((s) => Math.max(...s.curve.filter((p) => p[0] <= maxD).map((p) => p[1])))) * 1.05;
  const x = scaleLinear(0, maxD, L, L + pw);
  const y = scaleLinear(0, maxR, T + ph, T);

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
          const d = s.curve.map(([dd, rr], i) => (i ? "L" : "M") + x(dd).toFixed(1) + " " + y(rr).toFixed(1)).join(" ");
          const out = s.depth < threshold;
          const plateauRichness = s.curve[s.curve.length - 1][1];
          return (
            <path
              key={s.id}
              d={d}
              className={"curve" + (out ? " out" : "")}
              stroke={groupColor(s.group)}
              data-tip={`${s.id}|group=${groupName(s.group)}|max depth=${fmt(s.depth)} reads|plateau richness=${plateauRichness.toFixed(0)}|richness at ${fmt(threshold)}=${richnessAtDepth(s, Math.min(threshold, s.depth)).toFixed(1)}${out ? "|!Excluded at the current threshold" : ""}`}
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

  // Real per-sample rarefaction curves (G7) — fetched once, lazily, the
  // first time "Rarefaction" becomes the selected strategy (no point
  // paying for it while CSS/CLR is selected, since neither uses a depth
  // threshold). Everything after that (dragging the slider, hovering a
  // curve) is client-side against this same payload.
  const [rareData, setRareData] = useState(null);
  const [rareLoading, setRareLoading] = useState(false);
  const [rareError, setRareError] = useState(null);
  // Once the user has actually dragged the slider, stop auto-snapping it
  // to the freshly-loaded suggested_threshold — otherwise a slow fetch
  // that resolves after they've already moved it would silently undo
  // their choice.
  const [thresholdTouched, setThresholdTouched] = useState(false);

  const rare = selected === "rarefy";
  const rareSamples = rareData?.samples ?? [];
  const { groupColor, groupName } = useGroupStyle(rareSamples);
  const kept = rareData ? rareSamples.filter((s) => s.depth >= threshold) : [];
  const groupLabels = useMemo(() => [...new Set(rareSamples.map((s) => s.group))].sort(), [rareSamples]);
  const excludedAtSuggested = useMemo(
    () => (rareData ? rareSamples.filter((s) => s.depth < rareData.suggested_threshold) : []),
    [rareData, rareSamples]
  );
  // Slider range tracks this run's actual depth distribution instead of a
  // fixed 500-10,000 band: the crc_baxter cohort has a long right tail
  // (a handful of samples run past 200k reads), so the max is capped to
  // the 90th percentile of real depths rather than stretched to the
  // single largest outlier, which would make the slider nearly useless
  // for the other 90% of samples.
  const sliderMax = useMemo(() => {
    if (!rareSamples.length) return 10000;
    const depths = rareSamples.map((s) => s.depth).sort((a, b) => a - b);
    const p90 = depths[Math.floor(0.9 * (depths.length - 1))];
    return Math.max(2000, Math.ceil(p90 / 500) * 500);
  }, [rareSamples]);

  async function fetchRarefaction() {
    if (!state.sessionId) return;
    setRareLoading(true);
    setRareError(null);
    try {
      const data = await getRarefactionCurves(state.sessionId);
      setRareData(data);
      if (!thresholdTouched) actions.setThreshold(data.suggested_threshold);
    } catch (e) {
      setRareError(e.message);
    } finally {
      setRareLoading(false);
    }
  }

  const rareFetchedRef = useRef(false);
  useEffect(() => {
    if (!rare || rareFetchedRef.current || !state.sessionId) return;
    rareFetchedRef.current = true;
    fetchRarefaction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rare, state.sessionId]);

  function setThresholdManual(value) {
    setThresholdTouched(true);
    actions.setThreshold(value);
  }

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

  // Takes an explicit strategy rather than always trusting the `selected`
  // closure: the auto-proceed effect below fires the instant `gate` first
  // loads, in the same tick as fetchGate's own setSelected(data.strategy) -
  // batched React state updates aren't guaranteed to already be visible to
  // a sibling effect's closure at that exact point, and a stale/null
  // `selected` here previously sent an invalid strategy to the backend
  // (400). Passing gate.strategy explicitly sidesteps the race instead of
  // depending on render timing.
  async function confirmStrategy(strategyOverride) {
    const strategy = strategyOverride ?? selected;
    if (!state.sessionId || !strategy) return;
    setConfirming(true);
    setError(null);
    try {
      const data = await setNormalizeStrategy(state.sessionId, strategy);
      actions.setG6Gate(data);
      // Keeps state.normStrategy/betaMetric (R2) in sync for pages that
      // still read the reducer directly (e.g. the beta metric default).
      actions.setNormStrategy(strategy);
      setCascades(data.cascades);
      setConfirmedOnce(true);
      actions.addLog({
        key: "g6",
        page: "rarefy",
        human: true,
        src: "human-in-the-loop",
        text: `Normalization strategy set to ${STRATEGY_LABEL[strategy]}.`,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirming(false);
    }
  }

  // Runs automatically once a session exists — only the eventual CHOICE
  // waits for the human, not the AI's read of the data (same pattern as
  // the Design page). StrictMode double-invokes effects in dev, so a ref
  // (not state) guards this to exactly once per mount — otherwise every
  // page load would silently fire two live, billed Claude calls.
  const gateFetchedRef = useRef(false);
  useEffect(() => {
    if (gateFetchedRef.current || gate || !state.sessionId) return;
    gateFetchedRef.current = true;
    fetchGate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId]);

  // Auto-proceed's own "accept the recommendation and continue" promise
  // covers the WHOLE page, not just the final approve button below - without
  // this, turning auto-proceed on would silently strand the run here
  // forever, since confirmStrategy (a separate real Claude call, gated on
  // purpose) never fires on its own the way it does when a human clicks
  // through. Fires once per gate load, same StrictMode-safe ref-guard
  // pattern as the fetch effect above.
  const autoConfirmedRef = useRef(false);
  useEffect(() => {
    if (!state.autoProceed || !gate || autoConfirmedRef.current || confirmedOnce || confirming) return;
    autoConfirmedRef.current = true;
    confirmStrategy(gate.strategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.autoProceed, gate, confirmedOnce, confirming]);

  const hasPendingChange = gate && selected !== gate.strategy;
  // Enabled either the first time (nothing confirmed yet - accepting the
  // recommendation itself still needs an explicit click, same billed-call
  // reasoning as confirmedOnce above) or whenever the selection has since
  // changed. Previously only checked hasPendingChange, which is false right
  // after the recommendation loads (selected already equals gate.strategy),
  // so accepting the default was permanently unclickable - confirmedOnce
  // never became true, and "Approve and compute" below (which requires it)
  // could never enable either.
  const confirmDisabled = confirming || (confirmedOnce && !hasPendingChange);
  const totalSamples = gate?.options?.[0]?.retention_preview?.total ?? rareSamples.length;
  // While rarefaction is selected, don't let the reviewer approve ahead of
  // the real per-sample data actually loading — the threshold and
  // retained/excluded numbers on screen would still be the pre-fetch
  // placeholders (empty `kept`), not real answers.
  const canProceed = !!gate && confirmedOnce && !hasPendingChange && !(rare && (rareLoading || !rareData));

  function approve() {
    actions.addLog({
      key: "rarefyApprove",
      page: "rarefy",
      human: true,
      src: "human-in-the-loop",
      text: rare
        ? `Depth approved at ${fmt(threshold)} reads per sample. ${kept.length} samples retained, ${totalSamples - kept.length} excluded.`
        : `${STRATEGY_LABEL[gate.strategy]} approved. All ${totalSamples} samples retained.`,
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

      {(loading || (!gate && !error)) && (
        <div className="block appear">
          <div className="block-body pad-t text-sm text-ink-2 flex items-center gap-2.5">
            <Spinner />
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
                  {confirming
                    ? "Confirming is a live Claude + Paperclip call, same as the recommendation itself — this takes 30–60 seconds too, not stuck."
                    : hasPendingChange
                      ? `Selecting ${STRATEGY_LABEL[selected]} — confirm to record the decision and check for effects on later gates.`
                      : confirmedOnce
                        ? "This strategy is confirmed and logged."
                        : `Reviewer recommends ${STRATEGY_LABEL[selected]} — confirm to record the decision and check for effects on later gates.`}
                </p>
                <button type="button" className="btn btn-primary btn-sm" disabled={confirmDisabled} onClick={() => confirmStrategy()}>
                  {confirming ? "Confirming…" : "Confirm strategy"}
                </button>
              </div>
            </div>
          </div>

          {rare && (rareLoading || (!rareData && !rareError)) && (
            <div className="block appear">
              <div className="block-body pad-t text-sm text-ink-2 flex items-center gap-2.5">
                <Spinner />
                Computing real per-sample rarefaction curves (exact expected richness) and a plateau-derived depth for this run — a moment.
              </div>
            </div>
          )}

          {rare && rareError && (
            <div className="gate-note warn flex items-center gap-2.5">
              <span>{rareError}</span>
              <button type="button" className="btn btn-sm" onClick={fetchRarefaction}>
                Retry
              </button>
            </div>
          )}

          {rare && rareData && (
            <div className="agent">
              <div className="av">
                <SparkleIcon />
              </div>
              <div>
                <h4>Reviewer proposal</h4>
                <p>
                  I picked <span className="mono font-semibold">{fmt(rareData.suggested_threshold)} reads per sample</span> because that's the smallest depth where median marginal richness gain
                  across this run's {fmt(totalSamples)} samples has dropped to 3% or less per 500 additional reads — the curves have effectively plateaued — and Schloss (2024) found that rarefaction,
                  meaning repeated subsampling rather than single-pass rarefying, gives the highest statistical power for alpha and beta diversity when depth is uneven across groups.{" "}
                  {excludedAtSuggested.length > 0 ? (
                    <>
                      {fmt(excludedAtSuggested.length)} sample{excludedAtSuggested.length === 1 ? "" : "s"} (
                      {excludedAtSuggested.slice(0, 5).map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ", "}
                          <span className="mono">{s.id}</span>
                        </span>
                      ))}
                      {excludedAtSuggested.length > 5 ? `, +${excludedAtSuggested.length - 5} more` : ""}) stay below the line and are excluded, rather than forcing the whole cohort down to their
                      depth.
                    </>
                  ) : (
                    "Every sample in this run clears that depth, so none are excluded."
                  )}
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

          {rare && rareData && (
            <div className="rare-grid">
              <div className="block">
                <div className="block-head">
                  <div>
                    <h2>Rarefaction curves</h2>
                    <p className="sub">
                      Vertical line is the current threshold. Dimmed curves are excluded at that depth. Hover a curve for its plateau. {fmt(rareSamples.length)} samples from the real crc_baxter run.
                    </p>
                  </div>
                  <ChartTools
                    svgRef={svgRef}
                    name="rarefaction-curves"
                    getCsvRows={() => [["sample", "group", "depth", "retained"], ...rareSamples.map((s) => [s.id, groupName(s.group), s.depth, s.depth >= threshold ? "yes" : "no"])]}
                  />
                </div>
                <div className="block-body">
                  <RareChart svgRef={svgRef} threshold={threshold} samples={rareSamples} groupColor={groupColor} groupName={groupName} xMax={sliderMax} />
                  <div className="legend">
                    {groupLabels.map((g) => (
                      <div className="lg line" key={g}>
                        <i style={{ background: groupColor(g) }} />
                        {groupName(g)}
                      </div>
                    ))}
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
                  <input type="range" min={500} max={sliderMax} step={50} value={threshold} aria-label="Rarefaction depth" onChange={(e) => setThresholdManual(+e.target.value)} />
                  <div className="scale">
                    <span>500</span>
                    <span>{fmt(sliderMax)}</span>
                  </div>
                  <div className="retain">
                    <b>{kept.length} of {rareSamples.length}</b> samples retained
                    <br />
                    {groupLabels.map((g, i) => (
                      <span key={g}>
                        {i > 0 && " against "}
                        {groupName(g)} {kept.filter((s) => s.group === g).length}
                      </span>
                    ))}
                  </div>
                  <div className="sids">
                    {rareSamples.map((s) => {
                      const out = s.depth < threshold;
                      return (
                        <div key={s.id} className={"sid" + (out ? " out" : "")} data-tip={`${s.id}|group=${groupName(s.group)}|reads=${fmt(s.depth)}${out ? "|!Excluded" : ""}`}>
                          <i style={{ background: groupColor(s.group) }} />
                          {s.id}
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className="btn btn-sm mt-3 w-full" onClick={() => setThresholdManual(rareData.suggested_threshold)}>
                    Reset to proposal ({fmt(rareData.suggested_threshold)})
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
