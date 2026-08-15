// QcPage.jsx — ported from data-page="qc" in gut-pilot_mock_260814.html.
// Two-step progressive reveal: read-depth bar chart (with an adjustable QC
// floor) then a sanity checklist, matching the mock's RENDER_ON_REVEAL /
// LOG_ON_REVEAL / PAGE_REVEALS wiring for this page (revealed in order,
// each logging a decision-log entry, continue button gated on both).
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { belowFloor } from "../state/selectors";
import { samples, totalSeq, meanDepth, minDepth, maxDepth, fmt, groupName } from "../lib/data";
import Reveal from "../components/Reveal";
import ChartTools from "../components/ChartTools";
import BarChart from "../components/charts/BarChart";

const FLOOR_PRESETS = [
  { value: 1000, label: "1,000 permissive" },
  { value: 5000, label: "5,000 Weiss 2017" },
  { value: 10000, label: "10,000 conservative" },
];

const groupColor = (g) => (g === "H" ? "var(--color-cat-1)" : "var(--color-cat-8)");

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const WarnIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path
      d="M10 6v5m0 3h.01M2.7 16h14.6a1 1 0 0 0 .87-1.5L11.87 3.5a1 1 0 0 0-1.74 0L2.83 14.5A1 1 0 0 0 2.7 16Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Ported from the mock's floorNote() — the reviewer's read of the current
// floor setting. Kept here rather than in selectors.js since it's QC-page
// display text, not a value other pages/charts derive from.
function floorNote(state) {
  const below = belowFloor(state).sort((a, b) => a.depth - b.depth);
  const n = below.length;
  const h = below.filter((s) => s.group === "H").length;
  const c = n - h;
  const pct = Math.round((n / samples.length) * 100);
  const out = [];
  let warn = false;

  out.push(
    n === 0
      ? `No sample falls below ${fmt(state.floorDepth)} reads, so depth is not a screening concern for this cohort.`
      : `<b>${n} of ${samples.length}</b> samples (${pct}%) fall below ${fmt(state.floorDepth)} reads: <span class="mono">${below
          .map((s) => s.id + " at " + fmt(s.depth))
          .join(", ")}</span>.`
  );

  if (n >= 2 && (h === 0 || c === 0)) {
    warn = true;
    out.push(
      `Every flagged sample is ${h === 0 ? "CRC" : "Healthy"}. Depth-related dropout that tracks group membership is a confounder, not just a QC detail, because it thins one arm non-randomly.`
    );
  } else if (n > 0) {
    out.push(`Split across groups: Healthy ${h}, CRC ${c}.`);
  }
  if (pct > 25) {
    warn = true;
    out.push("Losing more than a quarter of the cohort to a screening threshold is worth questioning before you accept it.");
  }
  if (state.floorDepth < 1000) {
    warn = true;
    out.push("Below 1,000 reads a sample rarely supports a stable richness estimate, so this setting is close to not screening on depth at all.");
  }
  if (state.floorDepth > 15000) {
    warn = true;
    out.push("A floor this high is stricter than most published 16S workflows and trades statistical power for depth you may not need.");
  }

  const gap = samples.filter((s) => s.depth < state.floorDepth && s.depth >= state.threshold);
  if (gap.length) {
    warn = true;
    out.push(
      `<b>${gap.length}${gap.length === 1 ? " sample" : " samples"} sit in the gap</b> between the two settings: <span class="mono">${gap
        .map((s) => s.id)
        .join(", ")}</span> ${gap.length === 1 ? "is" : "are"} flagged as under-sequenced here but still ${
        gap.length === 1 ? "clears" : "clear"
      } the rarefaction depth of ${fmt(state.threshold)} reads, so ${gap.length === 1 ? "it" : "they"} would be analysed anyway. Raise the rarefaction depth or lower the floor.`
    );
  } else if (state.floorDepth > state.threshold) {
    out.push(`The floor is above the rarefaction depth of ${fmt(state.threshold)} reads, but no sample falls between them, so nothing is flagged and analysed at the same time.`);
  } else {
    out.push(`The floor flags only. Exclusion happens at the rarefaction gate, currently ${fmt(state.threshold)} reads.`);
  }
  return { warn, html: out.join(" ") };
}

export default function QcPage() {
  const { state, actions } = useAppState();
  const svgRef = useRef(null);
  const [checksRevealed, setChecksRevealed] = useState(!!state.revealed.qcChecks);

  const below = belowFloor(state);
  const note = floorNote(state);

  const sortedBars = useMemo(() => {
    return [...samples]
      .sort((a, b) => a.depth - b.depth)
      .map((s, i, arr) => {
        const low = s.depth < state.floorDepth;
        return {
          id: s.id,
          value: s.depth,
          flagged: low,
          color: low ? "var(--color-warn)" : groupColor(s.group),
          tip: `${s.id}|group=${groupName(s.group)}|reads=${fmt(s.depth)}|rank=${i + 1} of ${arr.length}${
            low ? `|!Below the ${fmt(state.floorDepth)} read floor` : ""
          }`,
        };
      });
  }, [state.floorDepth]);

  // The depth chart isn't gated behind a decision, so it loads as soon as
  // the page mounts rather than waiting for a "Run..." click — unlike
  // qcChecks below, which depends on wherever the floor slider ends up and
  // reads better as a deliberate "run the check now" step.
  useEffect(() => {
    if (state.revealed.qcDepth) return;
    actions.reveal("qcDepth");
    actions.addLog({
      key: "qcDepth",
      page: "qc",
      conf: 92,
      ref: "weiss2017",
      text: below.length
        ? `Flagged ${below.length}${below.length === 1 ? " sample" : " samples"} below the ${fmt(state.floorDepth)} read depth floor: ${below
            .map((s) => s.id + " at " + fmt(s.depth) + " reads")
            .join(", ")}.`
        : `No sample falls below the ${fmt(state.floorDepth)} read depth floor.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function revealChecks() {
    actions.reveal("qcChecks");
    setChecksRevealed(true);
    actions.addLog({
      page: "qc",
      conf: 99,
      src: "schema validator",
      text: "Parsed 24 samples by 187 genera from a tab-delimited count table, genus taken from the taxonomy lineage.",
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Raw data report</h1>
          <p className="lede">A sanity check before anything gets normalized. Nothing here is filtered yet, so problems stay visible.</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="label">Samples</span>
          <span className="v num">{samples.length}</span>
        </div>
        <div className="stat">
          <span className="label">Total sequences</span>
          <span className="v num sm">{fmt(totalSeq)}</span>
        </div>
        <div className="stat">
          <span className="label">Genera detected</span>
          <span className="v num">187</span>
        </div>
        <div className="stat">
          <span className="label">Mean depth</span>
          <span className="v num sm">{fmt(meanDepth)}</span>
          <span className="u">reads</span>
        </div>
        <div className="stat">
          <span className="label">Depth range</span>
          <span className="v num sm">
            {fmt(minDepth)} to {fmt(maxDepth)}
          </span>
          <span className="tag" style={below.length === 0 ? { background: "var(--color-good-bg)", color: "var(--color-good)" } : undefined}>
            {below.length === 0 ? "all above floor" : `${below.length} below floor`}
          </span>
        </div>
      </div>

      <div className="block appear">
          <div className="block-head">
            <div>
              <h2>Read depth per sample</h2>
              <p className="sub">Dashed line is the depth floor set below. Hover any bar for the exact count.</p>
            </div>
            <ChartTools svgRef={svgRef} name="read-depth" getCsvRows={() => [["sample", "group", "reads"], ...samples.map((s) => [s.id, groupName(s.group), s.depth])]} />
          </div>
          <div className="block-body flex flex-col gap-4">
            <div className="floor-ctl">
              <div className="floor-read">
                <span className="label">Depth floor</span>
                <div>
                  <span className="v num">{fmt(state.floorDepth)}</span>
                  <span className="u">reads</span>
                </div>
              </div>
              <div className="floor-slide">
                <input
                  type="range"
                  min={500}
                  max={20000}
                  step={250}
                  value={state.floorDepth}
                  aria-label="QC depth floor"
                  onChange={(e) => actions.setFloor(+e.target.value)}
                  onMouseUp={(e) => actions.setFloor(+e.target.value, { record: true })}
                  onKeyUp={(e) => actions.setFloor(+e.target.value, { record: true })}
                />
                <div className="scale">
                  <span>500</span>
                  <span>20,000</span>
                </div>
              </div>
              <div className="floor-presets">
                {FLOOR_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className="chip"
                    aria-pressed={state.floorDepth === p.value}
                    onClick={() => actions.setFloor(p.value, { record: true })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={"floor-note" + (note.warn ? " warn" : "")} dangerouslySetInnerHTML={{ __html: note.html }} />

            <BarChart
              svgRef={svgRef}
              bars={sortedBars}
              threshold={{ value: state.floorDepth, label: `${fmt(state.floorDepth)} read floor` }}
              yAxisLabel="reads"
              xAxisLabel="samples sorted by depth"
            />

            <div className="legend">
              <div className="lg">
                <i style={{ background: "var(--color-cat-1)" }} />
                Healthy
              </div>
              <div className="lg">
                <i style={{ background: "var(--color-cat-8)" }} />
                CRC
              </div>
              <div className="lg">
                <i style={{ background: "var(--color-warn)" }} />
                Below floor
              </div>
            </div>
          </div>
      </div>

      {!checksRevealed && (
        <Reveal title="Run sanity checks" subtitle="Parsing, duplicate IDs, depth floor" stepLabel="step 1 of 1" onReveal={revealChecks} />
      )}

      {checksRevealed && (
        <div className="block appear">
          <div className="block-head">
            <div>
              <h2>Sanity checklist</h2>
              <p className="sub">Failures are carried forward rather than silently dropped, so you decide what happens to them.</p>
            </div>
          </div>
          <div className="block-body">
            <div className="checks">
              {[
                { ok: true, t: "Delimiter auto-detected", d: "Tab separated, 24 sample columns and 187 genus rows" },
                { ok: true, t: "Taxonomy lineage parsed", d: "Genus taken from the last field of the lineage string" },
                { ok: true, t: "No duplicate sample IDs", d: "24 unique identifiers, all matched to metadata" },
                { ok: true, t: "No negative or fractional counts", d: "All values are non-negative integers" },
                below.length === 0
                  ? { ok: true, t: "All samples clear the depth floor", d: `No sample falls below ${fmt(state.floorDepth)} reads.` }
                  : {
                      ok: false,
                      t: `${below.length}${below.length === 1 ? " sample" : " samples"} below the depth floor`,
                      d: `${below.map((s) => s.id + " at " + fmt(s.depth) + " reads").join(", ")}. Carried into rarefaction rather than silently dropped.`,
                    },
              ].map((it, i) => (
                <div key={i} className={"check " + (it.ok ? "ok" : "warn")}>
                  {it.ok ? <CheckIcon /> : <WarnIcon />}
                  <div>
                    <b>{it.t}</b>
                    <p>{it.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="page-foot">
        <p className="hint">
          {below.length === 0
            ? "No sample is flagged at the current floor. The rarefaction gate is still where exclusion is decided."
            : `${below.length === 1 ? "One sample sits" : below.length + " samples sit"} below the depth floor. They stay in the table and get resolved at the rarefaction gate.`}
        </p>
        <button type="button" className="btn btn-primary btn-lg" disabled={!checksRevealed} onClick={() => actions.advanceTo("rarefy")}>
          Continue to rarefaction
        </button>
      </div>
    </section>
  );
}
