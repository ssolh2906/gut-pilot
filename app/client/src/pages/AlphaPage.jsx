// AlphaPage.jsx — ported from data-page="alpha" in gut-pilot_mock_260814.html.
// G8 significance settings, community composition (click a bar to inspect a
// sample), and per-group alpha diversity dumbbells.
//
// Deviates from the mock's reveal-gated pacing on purpose, consistent with
// NormalizationPage: neither the composition chart nor the diversity
// dumbbells are gated behind a decision (they only depend on G8/rank/norm,
// all already set above them on the page), so both render immediately
// instead of behind "Draw..."/"Compute..." buttons. Continue is always
// enabled for the same reason — there's no reveal state left to wait on.
import { useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { retained, adjustedP, sigCount, CORR_LABEL } from "../state/selectors";
import { OptRow, Opt, GateNote } from "../components/Gate";
import ChartTools from "../components/ChartTools";
import PageContextStrip from "../components/PageContextStrip";
import { samples, fmt, groupName, taxonAt, CATS, ALPHA_METRICS, refLink, refShort } from "../lib/data";

const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 9v4m0 3h.01M10.3 4.3 2.6 18a1.5 1.5 0 0 0 1.3 2.25h16.2A1.5 1.5 0 0 0 21.4 18L13.7 4.3a1.5 1.5 0 0 0-2.6 0Z" strokeLinejoin="round" />
  </svg>
);

const W = 900,
  H = 330,
  L = 46,
  R = 10,
  T = 12,
  B = 58;

// Merge composition categories up to the selected rank, so a higher rank
// visibly collapses slices instead of just relabelling them.
function mergeCats(rank) {
  const merged = [];
  CATS.forEach((c, ci) => {
    const name = taxonAt(rank, c.name);
    const hit = merged.find((m) => m.name === name);
    if (hit) hit.idx.push(ci);
    else merged.push({ name, css: c.css, mark: c.mark, idx: [ci] });
  });
  return merged;
}
const fracOf = (s, m) => m.idx.reduce((a, i) => a + s.comp[i], 0);

function CompChart({ svgRef, rank, onSelect }) {
  const pw = W - L - R;
  const ph = H - T - B;
  const bw = pw / samples.length;
  const merged = mergeCats(rank);

  return (
    <div className="plot wide">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Community composition">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const yy = T + ph - f * ph;
          return (
            <g key={f}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} className="gl" />
              <text x={L - 8} y={yy + 3.5} textAnchor="end" fontSize="10">
                {Math.round(f * 100)}%
              </text>
            </g>
          );
        })}

        {samples.map((s, i) => {
          const x = L + i * bw + bw * 0.12;
          const w = bw * 0.76;
          let cum = 0;
          const cx = x + w / 2;
          return (
            <g key={s.id}>
              {merged.map((m) => {
                const frac = fracOf(s, m);
                const yTop = T + ph - (cum + frac) * ph;
                const rect = (
                  <rect
                    key={m.name}
                    x={x}
                    y={yTop}
                    width={w}
                    height={Math.max(frac * ph - 1, 0)}
                    fill={m.css}
                    className="bar"
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(s.id)}
                    data-tip={`${s.id} ${m.name}|group=${groupName(s.group)}|relative abundance=${(frac * 100).toFixed(1)}%${m.idx.length > 1 ? "|merged from=" + m.idx.map((i) => CATS[i].name).join(" + ") : ""}`}
                  />
                );
                cum += frac;
                return rect;
              })}
              <text x={cx} y={H - B + 26} textAnchor="end" fontSize="9" transform={`rotate(-58 ${cx} ${H - B + 26})`}>
                {s.id}
              </text>
            </g>
          );
        })}

        <line x1={L} x2={L} y1={T} y2={H - B} className="ax" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="ax" />
      </svg>
    </div>
  );
}

function SampleDetail({ id }) {
  const s = samples.find((x) => x.id === id);
  if (!s) {
    return <p className="text-xs text-ink-3 leading-relaxed">Click a bar in the composition chart to inspect one sample.</p>;
  }
  const top = s.comp.map((f, i) => ({ ...CATS[i], f })).sort((a, b) => b.f - a.f).slice(0, 5);
  return (
    <>
      <div className="sid-big">{s.id}</div>
      <div className="grp">
        {s.group === "H" ? "Healthy control" : "CRC"}, {fmt(s.depth)} reads
      </div>
      <div className="minis">
        <div className="mini">
          <div className="l">Observed</div>
          <div className="v">{s.observed.toFixed(1)}</div>
        </div>
        <div className="mini">
          <div className="l">Shannon</div>
          <div className="v">{s.shannon.toFixed(2)}</div>
        </div>
        <div className="mini">
          <div className="l">Simpson</div>
          <div className="v">{s.simpson.toFixed(3)}</div>
        </div>
        <div className="mini">
          <div className="l">Chao1</div>
          <div className="v">{s.chao1.toFixed(1)}</div>
        </div>
      </div>
      <div className="taxa">
        {top.map((o) => (
          <div className="r" key={o.name}>
            <i style={{ background: o.css }} />
            <span className="n">
              {o.name}
              {o.mark && <span className={"mk " + o.mark}>{o.mark === "up" ? "↑" : "↓"}</span>}
            </span>
            <span className="p">{(o.f * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Dumbbells({ singleCohort, kept }) {
  if (singleCohort) {
    return (
      <GateNote
        variant="warn"
        html="<b>The group diversity comparison is unavailable in single-cohort mode.</b> No grouping variable was defined at the design gate, so there is nothing to compare against. The descriptive panels on this run still apply. To enable this, go back to Design and either supply metadata or assign groups manually."
      />
    );
  }
  return (
    <>
      {ALPHA_METRICS.map((m) => {
        const Hv = kept.filter((s) => s.group === "H").map((s) => s[m.key]);
        const Cv = kept.filter((s) => s.group === "C").map((s) => s[m.key]);
        const all = Hv.concat(Cv);
        const lo = Math.min(...all);
        const hi = Math.max(...all);
        const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        const mh = mean(Hv);
        const mc = mean(Cv);
        const x = (v) => 4 + ((v - lo) / (hi - lo || 1)) * 92;
        return (
          <div className="db-row" key={m.key}>
            <div className="l">{m.label}</div>
            <div className="db-track">
              <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "var(--color-line-2)" }} />
              <div
                style={{
                  position: "absolute",
                  left: Math.min(x(mh), x(mc)) + "%",
                  right: 100 - Math.max(x(mh), x(mc)) + "%",
                  top: "50%",
                  height: 2,
                  background: "var(--color-ink-3)",
                  transform: "translateY(-1px)",
                }}
              />
              <div
                data-tip={`${m.label} Healthy|mean=${mh.toFixed(3)}|n=${Hv.length}|range=${Math.min(...Hv).toFixed(2)} to ${Math.max(...Hv).toFixed(2)}`}
                style={{ position: "absolute", left: x(mh) + "%", top: "50%", width: 11, height: 11, borderRadius: "50%", background: "var(--color-cat-1)", transform: "translate(-50%,-50%)", border: "2px solid var(--color-surface)", cursor: "pointer" }}
              />
              <div
                data-tip={`${m.label} CRC|mean=${mc.toFixed(3)}|n=${Cv.length}|range=${Math.min(...Cv).toFixed(2)} to ${Math.max(...Cv).toFixed(2)}`}
                style={{ position: "absolute", left: x(mc) + "%", top: "50%", width: 11, height: 11, borderRadius: "50%", background: "var(--color-cat-8)", transform: "translate(-50%,-50%)", border: "2px solid var(--color-surface)", cursor: "pointer" }}
              />
            </div>
            <div className={"p" + (m.p < 0.05 ? " sig" : "")}>
              p = {m.p.toFixed(3)}
              {m.p < 0.05 ? " *" : " n.s."}
            </div>
          </div>
        );
      })}
      <div className="legend">
        <div className="lg dot">
          <i style={{ background: "var(--color-cat-1)" }} />
          Healthy mean
        </div>
        <div className="lg dot">
          <i style={{ background: "var(--color-cat-8)" }} />
          CRC mean
        </div>
        <div className="lg" style={{ color: "var(--color-ink-3)" }}>
          Significance threshold alpha = 0.05
        </div>
      </div>
    </>
  );
}

function statsNoteHtml(state) {
  const n = sigCount(state);
  const nTested = adjustedP(state).nTested;
  const strict = state.correction === "none";
  const tail = strict
    ? `Running ${fmt(nTested)} tests without correction will produce false positives by construction. Around ${Math.round(nTested * state.alphaLevel)} features would be expected to pass at this alpha even if nothing were truly different.`
    : state.correction === "bonferroni"
      ? "Bonferroni controls the chance of any false positive, which is conservative for exploratory microbiome work and will hide real but modest effects."
      : "Benjamini-Hochberg controls the expected proportion of false discoveries, which is the usual choice when the output is a candidate list rather than a single confirmatory test.";
  return `At alpha = <b>${state.alphaLevel}</b> with <b>${CORR_LABEL[state.correction]}</b>, <b>${n}</b> of the ${fmt(nTested)} tested features reach significance in the differential abundance panel. ${tail} Note that the five alpha diversity metrics on this panel are themselves five tests, and I am not correcting across them; reporting only the metric that cleared the line is the failure mode this gate exists to prevent.`;
}

export default function AlphaPage() {
  const { state, actions } = useAppState();
  const [selectedId, setSelectedId] = useState(null);
  const svgRef = useRef(null);
  const kept = retained(state);

  function setAlphaLevel(value) {
    actions.setAlphaLevel(value);
    actions.addLog({ key: "g8", page: "alpha", human: true, src: "human-in-the-loop", text: `Significance settings: alpha = ${value} with ${CORR_LABEL[state.correction]}.` });
  }
  function setCorrection(value) {
    actions.setCorrection(value);
    actions.addLog({ key: "g8", page: "alpha", human: true, src: "human-in-the-loop", text: `Significance settings: alpha = ${state.alphaLevel} with ${CORR_LABEL[value]}.` });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Alpha diversity</h1>
          <p className="lede">Within-sample structure. Composition first, then the summary metrics, because the metrics are easy to over-read on their own.</p>
        </div>
      </div>
      <PageContextStrip />

      {/* G8 */}
      <div className="block gate">
        <div className="block-head">
          <div>
            <h2>Significance settings</h2>
            <p className="sub">Set once, here, because this is the first screen with a p-value on it. These govern Alpha, Beta and Differential, and stay editable from the context strip.</p>
          </div>
        </div>
        <div className="block-body flex flex-col gap-4">
          <div>
            <span className="label">Significance level</span>
            <OptRow>
              {[
                { v: 0.01, l: "Strict" },
                { v: 0.05, l: "Convention" },
                { v: 0.1, l: "Exploratory" },
              ].map((o) => (
                <Opt key={o.v} pressed={state.alphaLevel === o.v} onClick={() => setAlphaLevel(o.v)} title={String(o.v)}>
                  {o.l}
                </Opt>
              ))}
            </OptRow>
          </div>
          <div>
            <span className="label">Multiple-testing correction</span>
            <OptRow>
              <Opt pressed={state.correction === "bh"} onClick={() => setCorrection("bh")} title="Benjamini-Hochberg">
                Controls FDR
              </Opt>
              <Opt pressed={state.correction === "bonferroni"} onClick={() => setCorrection("bonferroni")} title="Bonferroni">
                Controls FWER
              </Opt>
              <Opt pressed={state.correction === "none"} onClick={() => setCorrection("none")} title="None">
                Raw p-values
              </Opt>
            </OptRow>
          </div>
          <GateNote variant={state.correction === "none" ? "warn" : undefined} html={statsNoteHtml(state)} />
        </div>
      </div>

      <div className="two-col">
        <div className="block">
          <div className="block-head">
            <div>
              <h2>Community composition</h2>
              <p className="sub">Click any bar to inspect that sample. Hover a segment for the exact fraction.</p>
            </div>
            <ChartTools svgRef={svgRef} name="composition" getCsvRows={() => [["sample", "group", ...mergeCats(state.rank).map((m) => m.name)], ...samples.map((s) => [s.id, groupName(s.group), ...mergeCats(state.rank).map((m) => (fracOf(s, m) * 100).toFixed(1) + "%")])]} />
          </div>
          <div className="block-body">
            <CompChart svgRef={svgRef} rank={state.rank} onSelect={setSelectedId} />
            <div className="legend">
              {mergeCats(state.rank).map((m) => (
                <div className="lg" key={m.name}>
                  <i style={{ background: m.css }} />
                  {m.name}
                  {m.idx.length > 1 && (
                    <span className="mk" style={{ background: "var(--color-surface-3)", color: "var(--color-ink-3)" }}>
                      {m.idx.length} merged
                    </span>
                  )}
                  {m.idx.length === 1 && m.mark && <span className={"mk " + m.mark}>{m.mark === "up" ? "↑ CRC" : "↓ CRC"}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="block detail">
          <div className="block-head">
            <div>
              <h3>Sample detail</h3>
            </div>
          </div>
          <div className="block-body">
            <SampleDetail id={selectedId} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="agent flagged">
          <div className="av">
            <AlertIcon />
          </div>
          <div>
            <h4>Check your expectation, not just the p-value</h4>
            <p>
              A common prior is that the CRC gut has <b>lower diversity</b>. This cohort leans the other way. Richness (Observed and Chao1) trends <b>slightly higher in CRC</b>, and Shannon is flat at
              p = 0.62. That is consistent with the literature: CRC dysbiosis here is <b>taxon-specific enrichment</b> by oral-origin taxa, not a global loss of diversity. Do not over-read this panel.
              The real signal lives in the differential abundance page.
            </p>
            <div className="meta">
              <span className="conf warn">EXPECTATION MISMATCH</span>
              <a className="cite" href={refLink("thomas2019")} target="_blank" rel="noopener noreferrer">
                {refShort("thomas2019")} ↗
              </a>
            </div>
          </div>
        </div>

        <div className="block">
          <div className="block-head">
            <div>
              <h2>Alpha diversity by group</h2>
              <p className="sub">Group means from a 100-iteration rarefaction average, Wilcoxon rank-sum per metric. Read the direction of the effect, not only the significance.</p>
            </div>
            <ChartTools name="alpha-diversity" getCsvRows={() => [["metric", "p"], ...ALPHA_METRICS.map((m) => [m.label, m.p])]} />
          </div>
          <div className="block-body pad-t">
            <Dumbbells singleCohort={state.design.singleCohort} kept={kept} />
          </div>
        </div>
      </div>

      <div className="page-foot">
        <p className="hint">Alpha diversity answers "how varied is each sample". Beta diversity answers "how different are samples from each other".</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => actions.advanceTo("beta")}>
          Continue to beta diversity
        </button>
      </div>
    </section>
  );
}
