// BetaPage.jsx — ported from data-page="beta" in gut-pilot_mock_260814.html.
// G9 distance metric, PCoA ordination + PERMANOVA strip, and the Bray-Curtis
// distance matrix heatmap.
//
// Consistent with Alpha/Normalize: neither chart is gated behind a decision
// (both only depend on G9/G7, already set above them), so both render
// immediately instead of behind "Run PCoA..."/"Show the matrix" buttons, and
// Continue is always enabled.
//
// R2 (G6=CLR and G9=Bray-Curtis mismatch) is reachable here even though the
// reducer auto-forces the metric to Aitchison the moment G6 becomes CLR
// (see store.js's SET_NORM_STRATEGY): a user can still click back to
// Bray-Curtis or Jaccard afterwards, which is exactly the state R2 warns
// about. Aitchison itself is disabled unless G6=CLR, and UniFrac is always
// disabled (no phylogenetic tree), per docs/gates/G9.md.
import { useRef } from "react";
import { useAppState } from "../state/AppStateContext";
import { retained } from "../state/selectors";
import { OptRow, Opt, GateNote } from "../components/Gate";
import ChartTools from "../components/ChartTools";
import PageContextStrip from "../components/PageContextStrip";
import { scaleLinear, divergeColor, sequentialColor } from "../components/charts/chartHelpers";
import { samples, DIST, groupName, fmt, refLink, refShort } from "../lib/data";

const BETA_INFO = {
  bray: { label: "Bray-Curtis", r2: 0.038, p: 0.004 },
  jaccard: { label: "Jaccard", r2: 0.052, p: 0.011 },
  aitchison: { label: "Aitchison", r2: 0.061, p: 0.002 },
};

const heatOrder = (kept) => [...kept].sort((a, b) => (a.group === b.group ? a.id.localeCompare(b.id) : a.group === "H" ? -1 : 1));

function betaNoteHtml(state) {
  const clrMismatch = state.normStrategy === "clr" && state.betaMetric !== "aitchison";
  if (clrMismatch) {
    return "<b>Metric does not match the transform.</b> You selected CLR at the normalization gate, and Bray-Curtis on log-ratio values is not interpretable. Switch to Aitchison, or change the normalization back.";
  }
  const base = {
    bray: "Bray-Curtis weights abundance, so the result is driven by shifts in common taxa. No phylogenetic tree was supplied and sparsity is moderate at 38% zeros, so a tree-aware metric would add assumption without adding information.",
    jaccard: "Jaccard ignores abundance entirely, so a genus present at 0.01% counts the same as one at 30%. That raises the weight of rare taxa and makes the result more sensitive to sequencing depth, which matters here because depth is uneven.",
    aitchison: "Aitchison distance works in log-ratio space, which treats the data as compositional rather than as counts. It pairs with a CLR transform and is not meaningful on rarefied counts.",
  }[state.betaMetric];
  const i = BETA_INFO[state.betaMetric];
  return `${base} Current result: R² = ${i.r2.toFixed(3)}, p = ${i.p.toFixed(3)}.`;
}

function PcoaChart({ svgRef, kept }) {
  const W = 620,
    H = 420,
    P = 48;
  const xs = kept.map((s) => s.pc1);
  const ys = kept.map((s) => s.pc2);
  const x0 = Math.min(...xs) - 0.3,
    x1 = Math.max(...xs) + 0.3;
  const y0 = Math.min(...ys) - 0.3,
    y1 = Math.max(...ys) + 0.3;
  const x = scaleLinear(x0, x1, P, W - P);
  const y = scaleLinear(y0, y1, H - P, P);

  return (
    <div className="plot">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: 660, margin: "0 auto" }} role="img" aria-label="PCoA ordination">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="ax" />
        <line x1={P} x2={P} y1={P} y2={H - P} className="ax" />
        <line x1={x(0)} x2={x(0)} y1={P} y2={H - P} className="gl" />
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="gl" />

        {kept.map((s) => (
          <g className="pt" key={s.id} data-tip={`${s.id}|group=${groupName(s.group)}|PC1=${s.pc1.toFixed(3)}|PC2=${s.pc2.toFixed(3)}|CRC association=${s.assoc.toFixed(2)}|reads=${fmt(s.depth)}`}>
            <circle cx={x(s.pc1)} cy={y(s.pc2)} r={6.5} className="dot" fill={divergeColor(s.assoc)} stroke="var(--color-surface)" strokeWidth="1.6" />
          </g>
        ))}

        <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="11">
          PC1 (34.7% of variance)
        </text>
        <text x="15" y={H / 2} textAnchor="middle" fontSize="11" transform={`rotate(-90 15 ${H / 2})`}>
          PC2 (11.2% of variance)
        </text>
      </svg>
    </div>
  );
}

function HeatChart({ svgRef, kept }) {
  const k = heatOrder(kept);
  const n = k.length;
  const pad = 56,
    avail = 440;
  const cell = Math.floor(avail / n);
  const size = pad + cell * n + 14;

  return (
    <div className="plot">
      <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 560, margin: "0 auto" }} role="img" aria-label="Bray-Curtis distance matrix">
        {k.map((s, i) => (
          <g key={s.id}>
            <text x={pad - 6} y={pad + i * cell + cell * 0.68} textAnchor="end" fontSize="8.5" fill={s.group === "H" ? "var(--color-cat-1)" : "var(--color-cat-8)"}>
              {s.id}
            </text>
            <text
              x={pad + i * cell + cell * 0.72}
              y={pad - 6}
              textAnchor="start"
              fontSize="8.5"
              fill={s.group === "H" ? "var(--color-cat-1)" : "var(--color-cat-8)"}
              transform={`rotate(-90 ${pad + i * cell + cell * 0.72} ${pad - 6})`}
            >
              {s.id}
            </text>
          </g>
        ))}
        {k.map((a, i) =>
          k.map((b, j) => {
            const v = DIST[a.id][b.id];
            const same = a.group === b.group;
            return (
              <rect
                key={a.id + "-" + b.id}
                x={pad + j * cell}
                y={pad + i * cell}
                width={cell - 1}
                height={cell - 1}
                className="cell"
                fill={sequentialColor(v)}
                data-tip={`${a.id} against ${b.id}|Bray-Curtis=${v.toFixed(3)}|pair=${i === j ? "self" : same ? "within " + groupName(a.group) : "between groups"}|similarity=${((1 - v) * 100).toFixed(0)}%`}
              />
            );
          })
        )}
        {(() => {
          const split = k.findIndex((s) => s.group === "C");
          if (split <= 0) return null;
          const p = pad + split * cell - 0.5;
          return (
            <>
              <line x1={p} x2={p} y1={pad} y2={pad + n * cell} stroke="var(--color-ink-0)" strokeWidth="1.2" />
              <line x1={pad} x2={pad + n * cell} y1={p} y2={p} stroke="var(--color-ink-0)" strokeWidth="1.2" />
            </>
          );
        })()}
      </svg>
    </div>
  );
}

function PermanovaStrip({ singleCohort, metric, alphaLevel }) {
  if (singleCohort) {
    return (
      <GateNote
        variant="warn"
        html="<b>PERMANOVA is unavailable in single-cohort mode.</b> No grouping variable was defined at the design gate, so there is nothing to compare against. The descriptive panels on this run still apply. To enable this, go back to Design and either supply metadata or assign groups manually."
      />
    );
  }
  const i = BETA_INFO[metric];
  return (
    <div className="pv-strip">
      <div className="pv">
        <span className="l">PERMANOVA R²</span>
        <span className="v">{i.r2.toFixed(3)}</span>
      </div>
      <div className="pv">
        <span className="l">p-value</span>
        <span className="v" style={{ color: i.p < alphaLevel ? "var(--color-good)" : "var(--color-ink-0)" }}>
          {i.p.toFixed(3)}
        </span>
      </div>
      <div className="pv">
        <span className="l">Permutations</span>
        <span className="v">999</span>
      </div>
      <div className="pv">
        <span className="l">Dispersion</span>
        <span className="v">0.41</span>
      </div>
      <div className="pv">
        <span className="l">Metric</span>
        <span className="v" style={{ fontSize: 13 }}>
          {i.label}
        </span>
      </div>
    </div>
  );
}

export default function BetaPage() {
  const { state, actions } = useAppState();
  const kept = retained(state);
  const pcoaRef = useRef(null);
  const heatRef = useRef(null);

  function setBetaMetric(value) {
    actions.setBetaMetric(value);
    const i = BETA_INFO[value];
    actions.addLog({ key: "g9", page: "beta", human: true, src: "human-in-the-loop", text: `Beta diversity metric set to ${i.label} (R² = ${i.r2.toFixed(3)}, p = ${i.p.toFixed(3)}).` });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Beta diversity</h1>
          <p className="lede">Between-sample structure. Ordination and the raw distance matrix, so the statistic and the picture can be checked against each other.</p>
        </div>
      </div>
      <PageContextStrip />

      {/* G9 */}
      <div className="block gate">
        <div className="block-head">
          <div>
            <h2>Distance metric</h2>
            <p className="sub">Each metric asks a different question of the same table, so this is a scientific choice rather than a default.</p>
          </div>
        </div>
        <div className="block-body">
          <OptRow>
            <Opt pressed={state.betaMetric === "bray"} onClick={() => setBetaMetric("bray")} title="Bray-Curtis">
              Abundance weighted. Common taxa dominate the result.
            </Opt>
            <Opt pressed={state.betaMetric === "jaccard"} onClick={() => setBetaMetric("jaccard")} title="Jaccard">
              Presence and absence only. Rare taxa weigh far more.
            </Opt>
            <Opt pressed={state.betaMetric === "aitchison"} disabled={state.normStrategy !== "clr"} onClick={() => setBetaMetric("aitchison")} title="Aitchison">
              {state.normStrategy === "clr" ? "Log-ratio geometry. Required pairing for a CLR transform." : "Requires the CLR transform at the normalization gate."}
            </Opt>
            <Opt disabled title="UniFrac">
              Unavailable, no phylogenetic tree was supplied.
            </Opt>
          </OptRow>
          <GateNote variant={state.normStrategy === "clr" && state.betaMetric !== "aitchison" ? "warn" : undefined} html={betaNoteHtml(state)} />
          <div className="meta" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 11, flexWrap: "wrap" }}>
            <a className="cite" href={refLink("anderson2001")} target="_blank" rel="noopener noreferrer">
              {refShort("anderson2001")} ↗
            </a>
            <a className="cite" href={refLink("bray1957")} target="_blank" rel="noopener noreferrer">
              {refShort("bray1957")} ↗
            </a>
          </div>
        </div>
      </div>

      <div className="block">
        <div className="block-head">
          <div>
            <h2>PCoA on {BETA_INFO[state.betaMetric].label}</h2>
            <p className="sub">
              The clouds overlap heavily. Separation is significant but the effect is small, R² = {BETA_INFO[state.betaMetric].r2.toFixed(3)}. Colour is a CRC-association gradient, not a hard
              call. Hover a point for its coordinates.
            </p>
          </div>
          <ChartTools svgRef={pcoaRef} name="pcoa" getCsvRows={() => [["sample", "group", "pc1", "pc2", "assoc"], ...kept.map((s) => [s.id, groupName(s.group), s.pc1.toFixed(4), s.pc2.toFixed(4), s.assoc.toFixed(3)])]} />
        </div>
        <div className="block-body">
          <PcoaChart svgRef={pcoaRef} kept={kept} />
          <div className="legend">
            <div className="lg">
              <i style={{ width: 110, height: 10, borderRadius: 5, background: "linear-gradient(90deg,var(--color-div-lo),var(--color-div-mid),var(--color-div-hi))" }} />
            </div>
            <span style={{ fontSize: 11.5, color: "var(--color-ink-3)" }}>healthy-associated to ambiguous to CRC-associated</span>
          </div>
          <PermanovaStrip singleCohort={state.design.singleCohort} metric={state.betaMetric} alphaLevel={state.alphaLevel} />
          {!state.design.singleCohort && (
            <p style={{ fontSize: 12.5, color: "var(--color-ink-2)", marginTop: 12, maxWidth: "88ch" }}>
              A significant p with a tiny R² means the groups differ reliably but only slightly. Betadisper is not significant, so the PERMANOVA result reflects a location shift rather than
              unequal spread.
            </p>
          )}
        </div>
      </div>

      <div className="block">
        <div className="block-head">
          <div>
            <h2>Bray-Curtis distance matrix</h2>
            <p className="sub">Lighter is more similar. Hover any cell for the pair and its distance. The block structure on the diagonal is what PERMANOVA is testing.</p>
          </div>
          <ChartTools svgRef={heatRef} name="bray-curtis-matrix" getCsvRows={() => [["sample_a", "sample_b", "distance"], ...kept.flatMap((a) => kept.map((b) => [a.id, b.id, DIST[a.id][b.id].toFixed(4)]))]} />
        </div>
        <div className="block-body">
          <HeatChart svgRef={heatRef} kept={kept} />
          <div className="legend">
            <div className="lg">
              <i style={{ width: 110, height: 10, borderRadius: 5, background: "linear-gradient(90deg,var(--color-seq-lo),var(--color-seq-hi))" }} />
            </div>
            <span style={{ fontSize: 11.5, color: "var(--color-ink-3)" }}>0.00 identical to 1.00 fully dissimilar</span>
          </div>
        </div>
      </div>

      <div className="page-foot">
        <p className="hint">A small R² pushes the question down to individual taxa. That is the next page.</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => actions.advanceTo("da")}>
          Continue to differential abundance
        </button>
      </div>
    </section>
  );
}
