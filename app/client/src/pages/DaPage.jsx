import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useAutoProceed } from "../hooks/useAutoProceed";
import { getDifferentialAbundance } from "../lib/api";
import { Opt, OptRow, GateNote } from "../components/Gate";
import PageContextStrip from "../components/PageContextStrip";

const CORE = new Set(["Fusobacterium", "Porphyromonas", "Peptostreptococcus", "Parvimonas"]);

function Volcano({ rows }) {
  const extent = useMemo(() => Math.max(2, ...rows.map((row) => Math.abs(row.log2_fold_change))), [rows]);
  const x = (value) => 52 + ((value + extent) / (extent * 2)) * 616;
  const y = (q) => 338 - (Math.min(12, -Math.log10(Math.max(q, 1e-12))) / 12) * 292;
  return (
    <div className="plot wide">
      <svg viewBox="0 0 720 380" role="img" aria-label="Live differential abundance volcano plot">
        <line x1="52" x2="668" y1="338" y2="338" className="ax" />
        <line x1="360" x2="360" y1="46" y2="338" className="gl" />
        <line x1="52" x2="668" y1={y(0.05)} y2={y(0.05)} stroke="var(--color-warn)" strokeDasharray="5 4" />
        {rows.map((row) => (
          <circle key={row.genus} cx={x(row.log2_fold_change)} cy={y(row.q)} r={CORE.has(row.genus) ? 6 : 3.5}
            fill={row.significant ? (row.direction === "CRC" ? "var(--color-cat-8)" : "var(--color-cat-1)") : "var(--color-ink-3)"} opacity={row.significant ? 0.85 : 0.38}>
            <title>{row.genus} · {row.direction} · q={row.q.toPrecision(3)} · log2FC={row.log2_fold_change.toFixed(2)}</title>
          </circle>
        ))}
        <text x="360" y="371" textAnchor="middle" fontSize="11">log₂ fold change (CRC / Healthy)</text>
        <text x="15" y="192" textAnchor="middle" fontSize="11" transform="rotate(-90 15 192)">−log₁₀(q)</text>
      </svg>
    </div>
  );
}

export default function DaPage() {
  const { state, actions } = useAppState();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!state.sessionId) return;
    let active = true;
    setLoading(true);
    setError(null);
    getDifferentialAbundance(state.sessionId, state.prevFilter)
      .then((data) => { if (active) setResult(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [state.sessionId, state.prevFilter, retryVersion]);

  useAutoProceed(!!result && !loading, () => actions.advanceTo("refs"));
  const significant = result?.rows.filter((row) => row.significant) ?? [];

  function setPrevalence(value) {
    actions.setPrevFilter(value);
    actions.addLog({ key: "g10", page: "da", human: true, src: "human-in-the-loop", text: `Outcome-independent prevalence filter set to ${Math.round(value * 100)}%.` });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head"><div><h1>Differential abundance</h1><p className="lede">The live Baxter signal, computed from the uploaded table and checked against—not tuned toward—the published signature.</p></div></div>
      <PageContextStrip />
      <div className="block gate">
        <div className="block-head"><div><h2>Outcome-independent prevalence filter</h2><p className="sub">Freeze this before interpreting taxa. The default reproduces the app’s 10% benchmark.</p></div></div>
        <div className="block-body"><OptRow>{[0.01, 0.05, 0.1, 0.2].map((value) => <Opt key={value} title={`${Math.round(value * 100)}%`} pressed={state.prevFilter === value} recommended={value === 0.1} onClick={() => setPrevalence(value)}>Keep genera present in at least {Math.round(value * 100)}% of samples.</Opt>)}</OptRow></div>
      </div>
      {loading && <div className="block"><div className="block-body pad-t text-sm text-ink-2">Testing genera and correcting the full retained family…</div></div>}
      {error && (
        <div className="gate-note warn flex flex-wrap items-center gap-2.5">
          <span>The live differential-abundance panel could not refresh: {error}</span>
          <button type="button" className="btn btn-sm" onClick={() => setRetryVersion((value) => value + 1)}>
            Retry differential abundance
          </button>
        </div>
      )}
      {result && !loading && (
        <>
          <div className="pv-strip appear">
            <div className="pv"><span className="l">Tested genera</span><span className="v">{result.n_tested}</span></div>
            <div className="pv"><span className="l">BH q &lt; 0.05</span><span className="v">{result.n_significant}</span></div>
            <div className="pv"><span className="l">Core signature</span><span className="v">{result.core_signature_recovered.length}/4</span></div>
            <div className="pv"><span className="l">Prevalence</span><span className="v">{Math.round(result.prevalence_filter * 100)}%</span></div>
          </div>
          <div className="block appear">
            <div className="block-head"><div><h2>Taxon-level effects</h2><p className="sub">Large outlined points are the four prespecified Baxter/Duvallet replication taxa.</p></div></div>
            <div className="block-body"><Volcano rows={result.rows} /><GateNote html={result.interpretation} /></div>
          </div>
          <div className="block appear">
            <div className="block-head"><div><h2>Leading replicated signals</h2><p className="sub">Sorted by adjusted q-value. Literature status is assigned only after the data result is frozen.</p></div></div>
            <div className="block-body overflow-x-auto">
              <table className="w-full text-sm"><thead><tr><th className="text-left p-2">Genus</th><th className="text-left p-2">Direction</th><th className="text-right p-2">log₂FC</th><th className="text-right p-2">q-value</th><th className="text-left p-2">Interpretation</th></tr></thead>
                <tbody>{significant.slice(0, 16).map((row) => <tr key={row.genus} className="border-t border-line-1"><td className="p-2 font-mono">{row.genus}</td><td className="p-2">{row.direction}</td><td className="p-2 text-right font-mono">{row.log2_fold_change.toFixed(2)}</td><td className="p-2 text-right font-mono">{row.q.toExponential(2)}</td><td className="p-2">{CORE.has(row.genus) ? <span className="conf good">REPLICATES BAXTER</span> : "Cohort-supported"}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <div className="page-foot"><p className="hint">The final page connects the results, decisions, evidence, and limitations.</p><button type="button" className="btn btn-primary btn-lg" disabled={!result} onClick={() => actions.advanceTo("refs")}>View run summary</button></div>
    </section>
  );
}
