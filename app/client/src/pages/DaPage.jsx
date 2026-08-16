// DaPage.jsx — data-page="da" in the mock. Gate G10 (prevalence filter)
// wired to the real backend: Compute runs real CLR + Wilcoxon differential
// abundance (see app/server/compute/p07_differential_abundance.py) on the
// real crc_baxter H-vs-CRC comparison, Claude explains the fixed 10%
// default against this run's real per-threshold feature counts.
//
// Two different costs, two different fetch patterns (same split as
// Normalize's G6/G7): the gate NOTE (why 10%) is a live Claude call, fetched
// once and cached in AppState. The actual DA RESULTS (volcano/known-taxa/
// artifact panels) are pure Compute — cheap and fast — so every prevalence
// click refetches them directly, no separate "confirm" step needed.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useAutoProceed } from "../hooks/useAutoProceed";
import { getDaPrevalence, getDaResults } from "../lib/api";
import { OptRow, Opt, GateNote, ConfBadge } from "../components/Gate";
import Spinner from "../components/Spinner";
import ChartTools from "../components/ChartTools";
import { scaleLinear, tickFractions } from "../components/charts/chartHelpers";
import { fmt } from "../lib/data";
import { CORR_LABEL } from "../state/selectors";

const GROUP_COLOR_OVERRIDE = { H: "var(--color-cat-1)", CRC: "var(--color-cat-8)" };
const groupColor = (label) => GROUP_COLOR_OVERRIDE[label] ?? "var(--color-cat-4)";

const STATUS_LABEL = {
  confirmed: "Confirmed",
  discordant: "Discordant",
  not_significant: "Not significant here",
  dropped_by_filter: "Dropped by filter",
  not_detected: "Not detected",
};

const W = 640,
  H = 420,
  L = 52,
  R = 20,
  T = 16,
  B = 44;

function VolcanoChart({ svgRef, genera, alpha, labelB }) {
  const pw = W - L - R;
  const ph = H - T - B;
  const entries = Object.entries(genera);
  const maxAbsLfc = Math.max(1, ...entries.map(([, g]) => Math.abs(g.lfc)));
  const maxNegLogQ = Math.max(1, ...entries.map(([, g]) => -Math.log10(Math.max(g.q, 1e-300))));
  const x = scaleLinear(-maxAbsLfc, maxAbsLfc, L, L + pw);
  const y = scaleLinear(0, maxNegLogQ * 1.05, T + ph, T);
  const sigY = y(-Math.log10(alpha));

  return (
    <div className="plot">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: 680, margin: "0 auto" }} role="img" aria-label="Differential abundance volcano plot">
        {tickFractions(4).map((f) => {
          const xx = L + f * pw;
          const lfcVal = -maxAbsLfc + f * 2 * maxAbsLfc;
          return (
            <g key={f}>
              <line x1={xx} x2={xx} y1={T} y2={H - B} className="gl" />
              <text x={xx} y={H - B + 16} textAnchor="middle" fontSize="10">
                {lfcVal.toFixed(1)}
              </text>
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={sigY} y2={sigY} className="gl" strokeDasharray="4 3" />
        <text x={W - R} y={sigY - 4} textAnchor="end" fontSize="9.5" fill="var(--color-ink-3)">
          q = {alpha}
        </text>

        {entries.map(([taxon, g]) => {
          const cx = x(g.lfc);
          const cy = y(-Math.log10(Math.max(g.q, 1e-300)));
          const color = g.significant ? groupColor(g.direction) : "var(--color-ink-3)";
          return (
            <circle
              key={taxon}
              cx={cx}
              cy={cy}
              r={g.significant ? 5 : 3}
              fill={color}
              opacity={g.significant ? 0.9 : 0.35}
              stroke={g.artifact ? "var(--color-warn)" : "var(--color-surface)"}
              strokeWidth={g.artifact ? 1.8 : 1}
              data-tip={`${taxon}|log2FC=${g.lfc.toFixed(2)}|q=${g.q < 0.001 ? g.q.toExponential(1) : g.q.toFixed(3)}|enriched in=${g.direction ?? "neither"}|prevalence=${(g.prevalence * 100).toFixed(0)}%${g.artifact ? "|!driven by one sample (" + g.artifact.sample_id + ")" : ""}`}
            />
          );
        })}

        <line x1={L} x2={L} y1={T} y2={H - B} className="ax" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="ax" />
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="11">
          log2 fold change (enriched in {labelB} →)
        </text>
        <text x="14" y={T + ph / 2} textAnchor="middle" fontSize="11" transform={`rotate(-90 14 ${T + ph / 2})`}>
          −log10(q)
        </text>
      </svg>
    </div>
  );
}

export default function DaPage() {
  const { state, actions } = useAppState();
  const gate = state.daGate;
  const svgRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [results, setResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState(null);
  const [forkingPaths, setForkingPaths] = useState(false);

  async function fetchGate() {
    if (!state.sessionId) {
      setError("No active session yet — go back to Upload first so the backend has a dataset loaded.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getDaPrevalence(state.sessionId);
      actions.setDaGate(data);
      actions.addLog({
        key: "g10-proposal",
        page: "da",
        conf: 85,
        src: "reviewer",
        text: "Proposed a prevalence filter, weighing testing-burden reduction against this run's real per-threshold feature counts.",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchResults(threshold) {
    if (!state.sessionId) return;
    setResultsLoading(true);
    setResultsError(null);
    try {
      const data = await getDaResults(state.sessionId, { threshold, correction: state.correction, alpha: state.alphaLevel });
      setResults(data);
      if (state.daViewed && threshold !== 0.1) {
        setForkingPaths(true);
      } else {
        actions.setDaViewed();
      }
    } catch (e) {
      setResultsError(e.message);
    } finally {
      setResultsLoading(false);
    }
  }

  const gateFetchedRef = useRef(false);
  useEffect(() => {
    if (gateFetchedRef.current || gate || !state.sessionId) return;
    gateFetchedRef.current = true;
    fetchGate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId]);

  const resultsFetchedRef = useRef(false);
  useEffect(() => {
    if (resultsFetchedRef.current || !state.sessionId) return;
    resultsFetchedRef.current = true;
    fetchResults(state.prevFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId]);

  function setPrevFilter(value) {
    actions.setPrevFilter(value);
    actions.addLog({
      key: "g10",
      page: "da",
      human: true,
      src: "human-in-the-loop",
      text: `Prevalence filter set to ${value === 0 ? "no filter" : Math.round(value * 100) + "%"}.`,
    });
    fetchResults(value);
  }

  const knownConfirmed = useMemo(() => (results ? results.known_taxa.filter((k) => k.status === "confirmed") : []), [results]);
  const artifactHits = useMemo(() => (results ? Object.entries(results.genera).filter(([, g]) => g.artifact) : []), [results]);
  const topHits = useMemo(() => {
    if (!results) return [];
    return Object.entries(results.genera)
      .filter(([, g]) => g.significant)
      .sort((a, b) => a[1].q - b[1].q)
      .slice(0, 15);
  }, [results]);

  const ready = !!gate && !!results && !resultsLoading;
  useAutoProceed(ready, () => actions.advanceTo("refs"));

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Differential abundance</h1>
          <p className="lede">Where the CRC signal actually lives, one taxon at a time. Then a literature cross-check, then the artifact scan.</p>
        </div>
      </div>

      {(loading || (!gate && !error)) && (
        <div className="block appear">
          <div className="block-body pad-t text-sm text-ink-2 flex items-center gap-2.5">
            <Spinner />
            Reviewer is weighing the prevalence filter against this run's real per-threshold feature counts — this takes a little while.
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
                <h2>Prevalence filter</h2>
                <p className="sub">How many samples a taxon must appear in before it's tested at all — fewer tests means a less stringent correction.</p>
              </div>
              <ConfBadge>{gate.recommendation.label}</ConfBadge>
            </div>
            <div className="block-body flex flex-col gap-3">
              <OptRow columns={4}>
                {gate.options.map((opt) => (
                  <Opt
                    key={opt.value}
                    pressed={state.prevFilter === opt.value}
                    recommended={opt.value === gate.recommendation.threshold}
                    onClick={() => setPrevFilter(opt.value)}
                    title={opt.label}
                  >
                    {opt.sub ? opt.sub + " " : ""}
                    <span className="font-mono">({fmt(opt.n_tested)} tested)</span>
                  </Opt>
                ))}
              </OptRow>
              <GateNote html={gate.note.message} />
              {forkingPaths && (
                <GateNote
                  variant="warn"
                  html="<b>You changed this after seeing the results.</b> Tuning a prevalence filter until the hit list improves is a garden-of-forking-paths problem. If you keep this setting, say in the methods it was chosen post hoc."
                />
              )}
              <p className="text-xs text-ink-3">Method: CLR-transformed counts + Wilcoxon rank-sum, a single transparent sensitivity analysis — ANCOM-BC2 and full ALDEx2 are the literature's preferred primary methods but both are R-only and unavailable in this pipeline.</p>
            </div>
          </div>

          {resultsLoading && !results && (
            <div className="block appear">
              <div className="block-body pad-t text-sm text-ink-2 flex items-center gap-2.5">
                <Spinner />
                Running differential abundance on the real count table — a moment.
              </div>
            </div>
          )}

          {resultsError && (
            <div className="gate-note warn flex items-center gap-2.5">
              <span>{resultsError}</span>
              <button type="button" className="btn btn-sm" onClick={() => fetchResults(state.prevFilter)}>
                Retry
              </button>
            </div>
          )}

          {results && (
            <>
              <div className="block">
                <div className="block-head">
                  <div>
                    <h2>Volcano plot</h2>
                    <p className="sub">
                      {fmt(results.n_significant)} of {fmt(results.n_tested)} tested genera pass q &lt; {state.alphaLevel} ({CORR_LABEL[state.correction]}). Dim points are not significant. A ring
                      means the hit is driven by one sample — check it before trusting it. {resultsLoading && "Updating…"}
                    </p>
                  </div>
                  <ChartTools
                    svgRef={svgRef}
                    name="da-volcano"
                    getCsvRows={() => [
                      ["taxon", "lfc", "p", "q", "direction", "significant", "prevalence"],
                      ...Object.entries(results.genera).map(([t, g]) => [t, g.lfc.toFixed(3), g.p.toExponential(2), g.q.toExponential(2), g.direction ?? "", g.significant, g.prevalence.toFixed(2)]),
                    ]}
                  />
                </div>
                <div className="block-body">
                  <VolcanoChart svgRef={svgRef} genera={results.genera} alpha={state.alphaLevel} labelB={results.labels[1]} />
                  <div className="legend">
                    <div className="lg dot">
                      <i style={{ background: groupColor(results.labels[0]) }} />
                      Enriched in {results.labels[0]}
                    </div>
                    <div className="lg dot">
                      <i style={{ background: groupColor(results.labels[1]) }} />
                      Enriched in {results.labels[1]}
                    </div>
                    <div className="lg dot">
                      <i style={{ background: "var(--color-ink-3)" }} />
                      Not significant
                    </div>
                  </div>
                </div>
              </div>

              <div className="block">
                <div className="block-head">
                  <div>
                    <h2>Leading hits</h2>
                    <p className="sub">Ranked by q-value. Prevalence is the fraction of samples in each group where the taxon was detected at all.</p>
                  </div>
                </div>
                <div className="block-body" style={{ overflowX: "auto" }}>
                  <table className="kt-table">
                    <thead>
                      <tr>
                        <th>Taxon</th>
                        <th>Direction</th>
                        <th>log2FC</th>
                        <th>q</th>
                        <th>Prevalence {results.labels[0]}</th>
                        <th>Prevalence {results.labels[1]}</th>
                        <th>Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topHits.map(([taxon, g]) => (
                        <tr key={taxon}>
                          <td className="font-mono">{taxon}</td>
                          <td>
                            <span style={{ color: groupColor(g.direction) }}>{g.direction}</span>
                          </td>
                          <td className="font-mono">{g.lfc.toFixed(2)}</td>
                          <td className="font-mono">{g.q < 0.001 ? g.q.toExponential(1) : g.q.toFixed(3)}</td>
                          <td className="font-mono">{(g.prevalence_a * 100).toFixed(0)}%</td>
                          <td className="font-mono">{(g.prevalence_b * 100).toFixed(0)}%</td>
                          <td>{g.artifact ? <span className="conf warn">1-SAMPLE</span> : ""}</td>
                        </tr>
                      ))}
                      {topHits.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-ink-3 text-sm" style={{ padding: "10px 0" }}>
                            No taxa survive correction at this threshold. That's a real result, not a failure — it means the data don't support a taxon-level difference at the available power.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="block">
                <div className="block-head">
                  <div>
                    <h2>Known-taxa cross-check</h2>
                    <p className="sub">This run's result against a small curated table of CRC-associated genera from prior literature. Frozen before this lookup — not tuned to match it.</p>
                  </div>
                </div>
                <div className="block-body" style={{ overflowX: "auto" }}>
                  <table className="kt-table">
                    <thead>
                      <tr>
                        <th>Genus</th>
                        <th>Prior literature</th>
                        <th>This run</th>
                        <th>Status</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.known_taxa.map((k) => (
                        <tr key={k.taxon_genus}>
                          <td className="font-mono">{k.taxon_genus}</td>
                          <td>Enriched in {k.literature_direction}</td>
                          <td>{k.this_run_direction ? `Enriched in ${k.this_run_direction}` : "—"}</td>
                          <td>
                            <span className={"conf" + (k.status === "confirmed" ? " ok" : k.status === "discordant" ? " warn" : "")}>{STATUS_LABEL[k.status]}</span>
                          </td>
                          <td className="text-xs text-ink-3">{k.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {artifactHits.length > 0 && (
                <div className="gate-note warn flex flex-col gap-1">
                  <b>{artifactHits.length} significant hit{artifactHits.length === 1 ? "" : "s"} flagged for fragility.</b>
                  {artifactHits.map(([taxon, g]) => (
                    <div key={taxon}>
                      <span className="font-mono">{taxon}</span> — {(g.artifact.fraction * 100).toFixed(0)}% of its total abundance comes from one sample ({g.artifact.sample_id}). Treat this hit as
                      provisional until checked with that sample excluded.
                    </div>
                  ))}
                </div>
              )}

              {knownConfirmed.length > 0 && (
                <p className="text-xs text-ink-3">
                  {knownConfirmed.length} of the leading hits replicate prior CRC literature ({knownConfirmed.map((k) => k.taxon_genus).join(", ")}) — a replication, not a discovery. The full
                  interpretation is on the Summary page.
                </p>
              )}
            </>
          )}
        </>
      )}

      <div className="page-foot">
        <p className="hint">{results ? "The full synthesis — what this means, and what to check next — is on the next page." : "Prevalence filter, then the taxon-level results."}</p>
        <button type="button" className="btn btn-primary btn-lg" disabled={!ready} onClick={() => actions.advanceTo("refs")}>
          {resultsLoading ? "Computing…" : "Continue to summary"}
        </button>
      </div>
    </section>
  );
}
