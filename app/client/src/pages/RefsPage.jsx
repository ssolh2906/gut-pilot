import { useEffect, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import {
  getAlphaDiversity,
  getBetaDiversity,
  getDifferentialAbundance,
  getScientificSynthesis,
} from "../lib/api";
import { GateNote } from "../components/Gate";
import PageContextStrip from "../components/PageContextStrip";

export const AUDIT_BUNDLE_FILENAME = "gut-pilot-audit-bundle.json";

export function buildAuditBundle(
  state,
  alpha,
  beta,
  da,
  synthesis = null,
  generatedAt = new Date().toISOString(),
) {
  return {
    schema_version: "gut-pilot-audit-bundle-v1",
    generated_at: generatedAt,
    analysis_status: "complete",
    session: state.sessionMeta,
    decisions: state.log,
    alpha_diversity: alpha,
    beta_diversity: beta,
    differential_abundance: da,
    scientific_synthesis: synthesis,
    limitations: synthesis?.limitations ?? [
      "Genus-level 16S resolution cannot distinguish species or strains.",
      "Cross-sectional association does not establish causality.",
      "Asymmetric low-depth exclusion remains a sensitivity concern.",
    ],
  };
}

function EvidenceKind({ children }) {
  return <span className="conf ok">{children}</span>;
}

function SourceLink({ source }) {
  return (
    <a className="cite" href={source.url} target="_blank" rel="noopener noreferrer">
      {source.journal} {source.year} ↗
    </a>
  );
}

export default function RefsPage() {
  const { state } = useAppState();
  const [alpha, setAlpha] = useState(null);
  const [beta, setBeta] = useState(null);
  const [da, setDa] = useState(null);
  const [synthesis, setSynthesis] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!state.sessionId) return;
    let active = true;
    setRefreshError(null);
    Promise.all([
      getAlphaDiversity(state.sessionId, state.correction),
      getBetaDiversity(state.sessionId, "jaccard"),
      getDifferentialAbundance(state.sessionId, state.prevFilter),
      getScientificSynthesis(state.sessionId, state.correction, state.prevFilter),
    ]).then(([alphaResult, betaResult, daResult, synthesisResult]) => {
      if (active) {
        setAlpha(alphaResult);
        setBeta(betaResult);
        setDa(daResult);
        setSynthesis(synthesisResult);
      }
    }).catch((error) => { if (active) setRefreshError(error.message); });
    return () => { active = false; };
  }, [state.sessionId, state.correction, state.prevFilter, retryVersion]);

  function downloadSummary() {
    const payload = buildAuditBundle(state, alpha, beta, da, synthesis);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = AUDIT_BUNDLE_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const ready = alpha && beta && da && synthesis;
  const literatureById = Object.fromEntries((synthesis?.references ?? []).map((source) => [source.source_id, source]));
  const live = synthesis?.reasoning_source === "live_model";

  return (
    <section className="flex flex-col gap-5 synthesis-page">
      <div className="page-head">
        <div>
          <h1>Scientific synthesis</h1>
          <p className="lede">What the data teach us, how it fits the field, and the highest-value experiment to run next.</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={downloadSummary}>
          {ready ? "Download audit bundle" : "Preparing audit bundle…"}
        </button>
      </div>
      <PageContextStrip />

      <div className="synthesis-hero appear">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <EvidenceKind>DATA</EvidenceKind>
          {live && <span className="conf">CLAUDE + PAPERCLIP</span>}
        </div>
        <h2>{synthesis?.hero_title ?? "Synthesizing the computed results…"}</h2>
        <p>{synthesis?.hero_statement ?? "The final interpretation will appear when alpha, community, taxon-level, and literature results are ready."}</p>
        {synthesis && <div className="synthesis-scope">{synthesis.study_scope}</div>}
      </div>

      {synthesis && (
        <>
          <div className="block">
            <div className="block-head">
              <div><h2>What we learned</h2><p className="sub">Three scales of the same biological result, with magnitude and uncertainty kept visible.</p></div>
            </div>
            <div className="block-body synthesis-findings">
              {synthesis.findings.map((finding, index) => (
                <article className="finding-card" key={finding.label}>
                  <div className="finding-rank">0{index + 1}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <EvidenceKind>{finding.kind}</EvidenceKind>
                      <span className="conf">{finding.evidence_grade}</span>
                    </div>
                    <h3>{finding.label}</h3>
                    <p>{finding.claim}</p>
                    <div className="finding-quant">{finding.quantitative}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="two-col synthesis-overview">
            <div className="block">
              <div className="block-head"><div><h2>Integrated interpretation</h2><p className="sub">The minimum biological statement supported across analyses.</p></div></div>
              <div className="block-body"><p className="text-sm leading-6">{synthesis.integrated_interpretation}</p></div>
            </div>
            <div className="block">
              <div className="block-head"><div><h2>Analysis frame</h2><p className="sub">What was compared and how.</p></div></div>
              <div className="block-body flex flex-col gap-3 text-sm leading-6">
                <p>{synthesis.methods}</p>
                <p className="text-ink-2">{synthesis.data_credibility}</p>
              </div>
            </div>
          </div>

          <div className="block">
            <div className="block-head"><div><h2>Genera driving the signal</h2><p className="sub">Differential abundance is feature discovery—not species identification or biomarker validation.</p></div></div>
            <div className="block-body overflow-x-auto">
              <table className="synthesis-table">
                <thead><tr><th>Genus</th><th>Direction</th><th>log₂ fold change</th><th>FDR q</th><th>Prevalence</th></tr></thead>
                <tbody>{synthesis.taxa.map((taxon) => (
                  <tr key={taxon.genus}>
                    <td><b>{taxon.genus}</b></td><td>{taxon.direction}</td>
                    <td>{taxon.log2_fold_change.toFixed(2)}</td><td>{taxon.q_value.toPrecision(3)}</td><td>{(taxon.prevalence * 100).toFixed(1)}%</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          <div className="block">
            <div className="block-head"><div><h2>How this fits the field</h2><p className="sub">Paperclip-resolved evidence is matched to this run without collapsing genus, species, strain, and model systems.</p></div></div>
            <div className="block-body literature-grid">
              {synthesis.literature_context.map((item) => {
                const source = literatureById[item.source_id];
                return (
                  <article className="literature-card" key={item.source_id}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="conf warn">LITERATURE · {item.status}</span>
                      {source && <SourceLink source={source} />}
                    </div>
                    <h3>{source?.title ?? item.source_id}</h3>
                    <p>{item.connection}</p>
                    <div className="literature-caveat"><b>Resolution check:</b> {item.caveat}</div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="block discovery-block">
            <div className="block-head"><div><h2>Discovery opportunities</h2><p className="sub">Falsifiable hypotheses ranked as bridges from association to biological or pharma-relevant evidence.</p></div></div>
            <div className="block-body hypothesis-grid">
              {synthesis.hypotheses.map((hypothesis, index) => (
                <article className="hypothesis-card" key={hypothesis.title}>
                  <div className="flex items-center justify-between gap-3 mb-3"><span className="conf warn">HYPOTHESIS</span><span className="hypothesis-number">0{index + 1}</span></div>
                  <h3>{hypothesis.title}</h3>
                  <p>{hypothesis.rationale}</p>
                  <dl>
                    <dt>Prediction</dt><dd>{hypothesis.prediction}</dd>
                    <dt>Discriminating experiment</dt><dd>{hypothesis.experiment}</dd>
                    <dt>Why it matters</dt><dd>{hypothesis.translational_relevance}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </div>

          <div className="two-col">
            <div className="block">
              <div className="block-head"><div><h2>What could still explain this?</h2><p className="sub">Alternative explanations carried into the next study.</p></div></div>
              <div className="block-body"><ul className="list-disc pl-5 flex flex-col gap-3 text-sm">{synthesis.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
            <div className="block">
              <div className="block-head"><div><h2>Audit & reproduce</h2><p className="sub">The scientific story remains subordinate to the recorded run.</p></div></div>
              <div className="block-body">
                {state.log.length ? <div className="flex flex-col gap-3">{state.log.map((entry, index) => <div key={`${entry.key ?? "decision"}-${index}`} className="border-l-2 border-line-2 pl-3"><div className="text-[11px] font-mono text-ink-3">{entry.page ?? "run"} · {entry.src ?? "session"}</div><div className="text-sm">{entry.text}</div></div>)}</div> : <p className="text-sm text-ink-2">No manual overrides were required; the recommended path completed successfully.</p>}
              </div>
            </div>
          </div>

          <div className="block">
            <div className="block-head"><div><h2>Key references</h2><p className="sub">Only papers that materially support the interpretation or next experiments.</p></div></div>
            <div className="block-body"><div className="flex flex-col gap-3">{synthesis.references.map((source) => <div key={source.source_id} className="flex items-start justify-between gap-4 border-b border-line-1 pb-3"><div><div className="font-medium">{source.title}</div><div className="text-xs text-ink-2 mt-1">{source.supports}</div></div><SourceLink source={source} /></div>)}</div></div>
          </div>
        </>
      )}

      {refreshError ? (
        <div className="gate-note warn flex flex-wrap items-center gap-2.5">
          <span>The scientific synthesis could not refresh: {refreshError}</span>
          <button type="button" className="btn btn-sm" onClick={() => setRetryVersion((value) => value + 1)}>Retry synthesis</button>
        </div>
      ) : !ready && <GateNote html="The run is complete. The reviewer is connecting the computed results to verified literature; cached results will make subsequent visits immediate." />}
    </section>
  );
}
