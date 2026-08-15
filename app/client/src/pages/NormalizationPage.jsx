// NormalizationPage.jsx — ported from data-page="rarefy" in gut-pilot_mock_260814.html
// (id kept as "rarefy" to match lib/pages.js / state/store.js; only the
// file/component name matches the page's actual title/tab label).
//
// G6 normalization strategy, with R3 (CSS/CLR disables the depth gate G7)
// and R2 (CLR forces the beta metric to Aitchison, handled in the reducer).
//
// Deviates from the mock's pacing on purpose, consistent with QcPage: the
// curves aren't gated behind a decision (only behind which strategy is
// selected), so they render immediately instead of behind a "Draw
// rarefaction curves" reveal button. The mock's second reveal step
// ("Question the depth choice") opened a page-local ai-dock; since this app
// consolidated all per-page docks into the one FloatingChat (see
// UploadPage.jsx's header comment), that step has no content of its own
// left to gate, so it's dropped rather than kept as an empty click.
import { useRef } from "react";
import { useAppState } from "../state/AppStateContext";
import { retained } from "../state/selectors";
import { OptRow, Opt, GateNote } from "../components/Gate";
import ChartTools from "../components/ChartTools";
import { scaleLinear, tickFractions } from "../components/charts/chartHelpers";
import { samples, richnessAt, THRESH_DEFAULT, fmt, groupName, groupColor, refLink, refShort } from "../lib/data";

const NORM_INFO = {
  rarefy: { label: "Rarefaction" },
  css: { label: "CSS scaling" },
  clr: { label: "CLR transform" },
};

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

function normNoteHtml(normStrategy, kept) {
  if (normStrategy === "rarefy") {
    return `<b>Rarefaction selected.</b> Samples below the depth threshold are excluded, currently ${samples.length - kept.length} of ${samples.length}. Set the depth below.`;
  }
  if (normStrategy === "css") {
    return `<b>CSS selected.</b> All ${samples.length} samples are retained, including the ones flagged as under-sequenced at the QC floor, so the depth threshold below no longer applies. CSS assumes a common scaling regime across samples; if a sample is shallow because the library failed rather than because it was pooled low, that assumption does not hold for it.`;
  }
  return `<b>CLR selected.</b> All ${samples.length} samples are retained and counts become log-ratios, so the depth threshold no longer applies. Two consequences: a zero-replacement rule is now required, and <b>Bray-Curtis is no longer interpretable</b> on transformed values. I have moved the beta metric recommendation to Aitchison distance.`;
}

export default function NormalizationPage() {
  const { state, actions } = useAppState();
  const { normStrategy, threshold } = state;
  const svgRef = useRef(null);
  const rare = normStrategy === "rarefy";
  const kept = retained(state);

  function setStrategy(value) {
    actions.setNormStrategy(value);
    actions.addLog({
      key: "g6",
      page: "rarefy",
      human: true,
      src: "human-in-the-loop",
      text: `Normalization strategy set to ${NORM_INFO[value].label}${value === "rarefy" ? "." : `, so no sample is excluded by depth and all ${samples.length} are analysed.`}`,
    });
  }

  function approve() {
    actions.addLog({
      page: "rarefy",
      human: true,
      src: "human-in-the-loop",
      text: rare
        ? `Depth approved at ${fmt(threshold)} reads per sample. ${kept.length} samples retained, ${samples.length - kept.length} excluded.`
        : `${NORM_INFO[normStrategy].label} approved. All ${samples.length} samples retained.`,
    });
    actions.advanceTo("alpha");
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Normalization</h1>
          <p className="lede">The literature genuinely splits here, so this page argues both sides before you pick. Everything downstream inherits the choice.</p>
        </div>
      </div>

      {/* G6 */}
      <div className="block gate">
        <div className="block-head">
          <div>
            <h2>Normalization strategy</h2>
            <p className="sub">Uneven depth has to be handled somehow. There is no consensus on which way is correct, and any tool that hides this choice is making it for you.</p>
          </div>
        </div>
        <div className="block-body">
          <OptRow>
            <Opt pressed={normStrategy === "rarefy"} onClick={() => setStrategy("rarefy")} title="Rarefaction">
              Repeated subsampling to a common depth. Discards reads and excludes shallow samples.
            </Opt>
            <Opt pressed={normStrategy === "css"} onClick={() => setStrategy("css")} title="CSS scaling">
              Cumulative sum scaling. Keeps every sample, assumes a shared scaling regime.
            </Opt>
            <Opt pressed={normStrategy === "clr"} onClick={() => setStrategy("clr")} title="CLR transform">
              Centered log-ratio. Compositionally rigorous, needs a zero-replacement rule.
            </Opt>
          </OptRow>
          <GateNote variant={rare ? undefined : "warn"} html={normNoteHtml(normStrategy, kept)} />
          <div className="debate-box">
            <div className="db-side">
              <span className="label">For rarefaction</span>
              <p>Repeated subsampling gives the highest statistical power for alpha and beta diversity when depth is uneven across groups.</p>
              <a className="cite" href={refLink("schloss2024")} target="_blank" rel="noopener noreferrer">
                {refShort("schloss2024")} ↗
              </a>
            </div>
            <div className="db-side">
              <span className="label">Against rarefaction</span>
              <p>Discarding reads to equalise depth is statistically inadmissible for differential abundance, and wastes data that a model could use.</p>
              <a className="cite" href={refLink("mcmurdie2014")} target="_blank" rel="noopener noreferrer">
                {refShort("mcmurdie2014")} ↗
              </a>
            </div>
            <div className="db-side">
              <span className="label">Third position</span>
              <p>Sequencing data are compositional. Neither rarefying nor scaling fixes that, and log-ratio methods address it directly.</p>
              <a className="cite" href={refLink("gloor2017")} target="_blank" rel="noopener noreferrer">
                {refShort("gloor2017")} ↗
              </a>
            </div>
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

      <div className="page-foot">
        <p className="hint">{rare ? "Approving records the threshold in the decision log and locks it in for every downstream panel." : "Approving records this choice in the decision log."}</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={approve}>
          Approve {rare ? fmt(threshold) : NORM_INFO[normStrategy].label} and compute
        </button>
      </div>
    </section>
  );
}
