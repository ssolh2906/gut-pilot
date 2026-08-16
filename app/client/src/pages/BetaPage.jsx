import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useAutoProceed } from "../hooks/useAutoProceed";
import { getBetaDiversity } from "../lib/api";
import { Opt, OptRow, GateNote } from "../components/Gate";
import PageContextStrip from "../components/PageContextStrip";

const METRICS = {
  jaccard: ["Jaccard", "Presence/absence; sensitive to consistent colonization by additional taxa."],
  bray: ["Bray-Curtis", "Abundance-weighted; a useful sensitivity view for common taxa."],
  aitchison: ["Aitchison", "Log-ratio geometry; available when CLR is selected."],
};

function Pcoa({ points }) {
  const bounds = useMemo(() => {
    const xs = points.map((point) => point.pc1);
    const ys = points.map((point) => point.pc2);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [points]);
  const x = (value) => 42 + ((value - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * 616;
  const y = (value) => 350 - ((value - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * 310;
  return (
    <div className="plot wide">
      <svg viewBox="0 0 700 390" role="img" aria-label="Live PCoA ordination of uploaded samples">
        <line x1="42" x2="658" y1="350" y2="350" className="ax" />
        <line x1="42" x2="42" y1="40" y2="350" className="ax" />
        {points.map((point) => (
          <circle key={point.sample_id} cx={x(point.pc1)} cy={y(point.pc2)} r="3.4"
            fill={point.group === "CRC" ? "var(--color-cat-8)" : "var(--color-cat-1)"} opacity="0.68">
            <title>{point.sample_id} · {point.group} · PC1 {point.pc1.toFixed(3)} · PC2 {point.pc2.toFixed(3)}</title>
          </circle>
        ))}
        <text x="350" y="378" textAnchor="middle" fontSize="11">PC1</text>
        <text x="13" y="195" textAnchor="middle" fontSize="11" transform="rotate(-90 13 195)">PC2</text>
      </svg>
    </div>
  );
}

export default function BetaPage() {
  const { state, actions } = useAppState();
  const [metric, setMetric] = useState("jaccard");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!state.sessionId) return;
    let active = true;
    setLoading(true);
    setError(null);
    getBetaDiversity(state.sessionId, metric)
      .then((data) => { if (active) setResult(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [state.sessionId, metric, retryVersion]);

  useAutoProceed(!!result && !loading, () => actions.advanceTo("da"));

  function chooseMetric(next) {
    setMetric(next);
    actions.setBetaMetric(next);
    actions.addLog({ key: "g9", page: "beta", human: true, src: "human-in-the-loop", text: `Beta-diversity view set to ${METRICS[next][0]}.` });
  }

  const stats = result?.permanova;
  return (
    <section className="flex flex-col gap-5">
      <div className="page-head"><div><h1>Beta diversity</h1><p className="lede">A live between-sample analysis of the uploaded cohort—not mock coordinates.</p></div></div>
      <PageContextStrip />
      <div className="block gate">
        <div className="block-head"><div><h2>Distance metric</h2><p className="sub">Jaccard is the reviewer’s primary view for this colonization-style signature; Bray-Curtis remains one click away.</p></div></div>
        <div className="block-body">
          <OptRow>
            {Object.entries(METRICS).map(([key, [label, description]]) => (
              <Opt key={key} title={label} pressed={metric === key} recommended={key === "jaccard"}
                disabled={key === "aitchison" && state.normStrategy !== "clr"} onClick={() => chooseMetric(key)}>
                {description}
              </Opt>
            ))}
          </OptRow>
        </div>
      </div>
      {loading && <div className="block"><div className="block-body pad-t text-sm text-ink-2">Computing the distance matrix, ordination, PERMANOVA, and dispersion check…</div></div>}
      {error && (
        <div className="gate-note warn flex flex-wrap items-center gap-2.5">
          <span>The live beta analysis could not be refreshed: {error}</span>
          <button type="button" className="btn btn-sm" onClick={() => setRetryVersion((value) => value + 1)}>
            Retry beta analysis
          </button>
        </div>
      )}
      {result && !loading && (
        <div className="block appear">
          <div className="block-head"><div><h2>Live {result.metric_label} PCoA</h2><p className="sub">{result.points.length} uploaded samples. Hover a point for its sample ID and coordinates.</p></div></div>
          <div className="block-body">
            <Pcoa points={result.points} />
            <div className="pv-strip">
              <div className="pv"><span className="l">PERMANOVA R²</span><span className="v">{stats.r2.toFixed(3)}</span></div>
              <div className="pv"><span className="l">p-value</span><span className="v">{stats.p.toPrecision(3)}</span></div>
              <div className="pv"><span className="l">Permutations</span><span className="v">{stats.permutations}</span></div>
              <div className="pv"><span className="l">Dispersion p</span><span className="v">{stats.dispersion_p.toPrecision(3)}</span></div>
              <div className="pv"><span className="l">Metric</span><span className="v" style={{ fontSize: 13 }}>{result.metric_label}</span></div>
            </div>
            <GateNote variant={stats.dispersion_p < 0.05 ? "warn" : undefined} html={result.interpretation} />
          </div>
        </div>
      )}
      <div className="page-foot"><p className="hint">The community-level effect now hands off to the taxa driving it.</p><button type="button" className="btn btn-primary btn-lg" disabled={!result} onClick={() => actions.advanceTo("da")}>Continue to differential abundance</button></div>
    </section>
  );
}
