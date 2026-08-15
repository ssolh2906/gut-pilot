// DesignPage.jsx — ported from data-page="design" in gut-pilot_mock_260814.html.
// Four gates: G1 group definition, G2 batch effects, G3 sample independence,
// G4 taxonomic rank. Confirming logs all four (keyed g1-g4) and advances to QC.
//
// R4 (single-cohort disables group comparisons) lives in the reducer —
// SET_GROUP_SOURCE derives design.singleCohort there, not here.
//
// R7 deviates from the mock on purpose: docs/gates/G3.md specifies "paired"
// must be blocked, not just warned about, because this dataset has no
// subject_id column to support it. The mock lets you click it and only
// warns; here the option is disabled outright with the reason inline.
import { useMemo } from "react";
import { useAppState } from "../state/AppStateContext";
import { OptRow, Opt, GateNote } from "../components/Gate";
import { samples, groupName, fmt, groupColor, batchTable, RANKS, CATS, taxonAt, featureCount } from "../lib/data";

export default function DesignPage() {
  const { state, actions } = useAppState();
  const { design, rank } = state;

  // samples is a mutated singleton (toggleSampleGroup edits it in place),
  // so groupVersion is what actually needs to trigger recomputation here.
  const counts = useMemo(() => {
    const h = samples.filter((s) => s.group === "H").length;
    return { h, c: samples.length - h };
  }, [state.groupVersion]);

  function confirm() {
    actions.confirmDesign();
    actions.addLog({
      key: "g1",
      page: "design",
      human: true,
      src: "human-in-the-loop",
      text: design.singleCohort
        ? "Confirmed single-cohort mode. No grouping variable, so all group comparisons are disabled for this run."
        : `Confirmed the grouping (${design.groupSource === "inferred" ? "inferred from sample ID prefix" : "assigned manually"}): Healthy ${counts.h} against CRC ${counts.c}.`,
    });
    actions.addLog({
      key: "g2",
      page: "design",
      human: true,
      src: "human-in-the-loop",
      text: `Batch handling set to ${{ none: "proceed and record the confounding risk", covariate: "include batch as a covariate", stratify: "stratify permutations by batch" }[design.batchHandling]}.`,
    });
    actions.addLog({
      key: "g3",
      page: "design",
      human: true,
      src: "human-in-the-loop",
      text: `Samples declared ${design.pairing === "paired" ? "paired or repeated measures, so tests use Wilcoxon signed-rank" : "independent, so tests use Wilcoxon rank-sum"}.`,
    });
    actions.addLog({
      key: "g4",
      page: "design",
      human: true,
      src: "human-in-the-loop",
      text: `Analysis rank set to ${RANKS[rank].label}, ${fmt(featureCount(rank))} features.`,
    });
    actions.advanceTo("qc");
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Study design</h1>
          <p className="lede">What is actually being compared. Nothing downstream means anything until this is right, so the reviewer proposes and you confirm.</p>
        </div>
      </div>

      {/* G1 */}
      <div className="block gate">
        <div className="block-head">
          <div>
            <h2>Group definition</h2>
            <p className="sub">No metadata file was supplied, so the grouping below is inferred from the sample ID pattern. Check it before continuing.</p>
          </div>
        </div>
        <div className="block-body">
          <OptRow>
            <Opt pressed={design.groupSource === "inferred"} onClick={() => actions.setGroupSource("inferred")} title="Use the inferred grouping">
              Prefix H maps to Healthy and C maps to CRC
            </Opt>
            <Opt pressed={design.groupSource === "manual"} onClick={() => actions.setGroupSource("manual")} title="Assign groups manually">
              Edit the assignment sample by sample
            </Opt>
            <Opt pressed={design.groupSource === "none"} onClick={() => actions.setGroupSource("none")} title="No grouping, single cohort">
              Descriptive panels only, all group comparisons disabled
            </Opt>
          </OptRow>

          {design.groupSource !== "none" && (
            <div className="assign">
              {samples.map((s) => (
                <span
                  key={s.id}
                  className={"sid" + (design.groupSource === "manual" ? " editable" : "")}
                  onClick={design.groupSource === "manual" ? () => actions.toggleSampleGroup(s.id) : undefined}
                  data-tip={`${s.id}|group=${groupName(s.group)}|reads=${fmt(s.depth)}${design.groupSource === "manual" ? "|Click to switch group" : ""}`}
                >
                  <i style={{ background: groupColor(s.group) }} />
                  {s.id}
                </span>
              ))}
            </div>
          )}

          <GateNote
            variant={design.groupSource === "none" ? "warn" : undefined}
            html={
              design.groupSource === "none"
                ? "<b>Single-cohort mode.</b> Every group comparison is switched off: alpha diversity group tests, PERMANOVA, and differential abundance. The descriptive panels still run, so you keep depth, composition, per-sample alpha and the distance matrix. This is a supported mode, not a degraded one, but it does mean this run cannot answer a Healthy against CRC question."
                : design.groupSource === "inferred"
                  ? `Inferred two groups from the ID prefix: <b>Healthy ${counts.h}</b> and <b>CRC ${counts.c}</b>. I am reading <span class="mono">H-</span> and <span class="mono">C-</span> as the group marker because every one of the ${samples.length} IDs matches that pattern and the split is balanced. That is a guess from a naming convention, not metadata, so confirm it before I use it as the comparison.`
                  : `Manual assignment. Click any sample to move it between groups. Current split: <b>Healthy ${counts.h}</b> and <b>CRC ${counts.c}</b>.`
            }
          />
        </div>
      </div>

      {/* G2 */}
      <div className="block gate">
        <div className="block-head">
          <div>
            <h2>Batch effects</h2>
            <p className="sub">
              A <span className="font-mono">batch</span> column was found. Batch that tracks group membership is the most common way a disease signal turns out to be a processing signal.
            </p>
          </div>
        </div>
        <div className="block-body">
          <BatchTable groupVersion={state.groupVersion} />
          <GateNote
            variant={design.singleCohort ? undefined : batchSkewWarns() ? "warn" : "good"}
            html={
              design.singleCohort
                ? "No grouping is defined, so there is nothing for batch to confound. This gate is inactive."
                : batchSkewWarns()
                  ? `<b>Batch is not balanced across groups.</b> ${Math.round(batchSkew() * 100)}% of CRC samples sit in a single batch. If the batches were processed at different times or with different kits, a significant PERMANOVA result cannot be separated from a processing effect. I cannot tell these apart from the count table alone, which is why this is your call rather than mine.`
                  : "Batch is reasonably balanced across groups, so confounding is unlikely to drive the group comparison."
            }
          />
          <OptRow>
            <Opt pressed={design.batchHandling === "covariate"} onClick={() => actions.setBatchHandling("covariate")} title="Include batch as a covariate">
              PERMANOVA models batch alongside group
            </Opt>
            <Opt pressed={design.batchHandling === "stratify"} onClick={() => actions.setBatchHandling("stratify")} title="Stratify permutations by batch">
              Permutes within batch only
            </Opt>
            <Opt pressed={design.batchHandling === "none"} onClick={() => actions.setBatchHandling("none")} title="Proceed and record the risk">
              Results carry a confounding caveat
            </Opt>
          </OptRow>
        </div>
      </div>

      {/* G3 */}
      <div className="block gate">
        <div className="block-head">
          <div>
            <h2>Sample independence</h2>
            <p className="sub">This decides the test family. Getting it wrong invalidates every p-value on the run, so it is confirmed even when the check is clean.</p>
          </div>
        </div>
        <div className="block-body">
          <GateNote
            html={`I checked for repeated subject identifiers and found none: ${samples.length} IDs, ${samples.length} distinct subjects, no timepoint column. That points to independent samples, so I propose Wilcoxon rank-sum with unrestricted permutations.`}
          />
          <OptRow>
            <Opt pressed={design.pairing === "independent"} onClick={() => actions.setPairing("independent")} title="Independent samples">
              Wilcoxon rank-sum, unrestricted permutations
            </Opt>
            <Opt disabled title="Paired or repeated measures">
              No subject_id column was supplied, so paired tests cannot be executed
            </Opt>
          </OptRow>
        </div>
      </div>

      {/* G4 */}
      <div className="block gate">
        <div className="block-head">
          <div>
            <h2>Taxonomic rank</h2>
            <p className="sub">Higher ranks merge taxa. That buys statistical power and loses resolution, and the trade is worth seeing rather than reading about.</p>
          </div>
        </div>
        <div className="block-body">
          <OptRow>
            {Object.entries(RANKS).map(([key, r]) => (
              <Opt key={key} pressed={rank === key} onClick={() => actions.setRank(key)} title={r.label}>
                <span className="num">{fmt(r.n)} features</span>
              </Opt>
            ))}
          </OptRow>
          <GateNote variant={rank === "phylum" ? "warn" : undefined} html={rankNoteHtml(rank)} />
        </div>
      </div>

      <div className="page-foot">
        <p className="hint">
          {design.singleCohort
            ? "Continuing in single-cohort mode. Group comparisons stay disabled for the rest of the run."
            : "Confirming records these four choices in the decision log. You can come back and change them."}
        </p>
        <button type="button" className="btn btn-primary btn-lg" onClick={confirm}>
          Confirm design and continue
        </button>
      </div>
    </section>
  );
}

function batchSkew() {
  const t = batchTable();
  const cC = t.B1.C + t.B2.C;
  return cC ? Math.max(t.B1.C, t.B2.C) / cC : 0;
}
function batchSkewWarns() {
  return batchSkew() > 0.7;
}

function BatchTable() {
  const t = batchTable();
  const cH = t.B1.H + t.B2.H;
  const cC = t.B1.C + t.B2.C;
  const total = cH + cC;
  return (
    <table className="xtab">
      <thead>
        <tr>
          <th>Batch</th>
          <th>Healthy</th>
          <th>CRC</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {["B1", "B2"].map((b) => {
          const row = t[b];
          const tot = row.H + row.C;
          const lop = tot > 0 && (row.H === 0 || row.C === 0 || Math.max(row.H, row.C) / tot > 0.75);
          return (
            <tr key={b}>
              <td>
                <b>{b}</b>
              </td>
              <td className={lop ? "hot" : ""}>{row.H}</td>
              <td className={lop ? "hot" : ""}>{row.C}</td>
              <td>{tot}</td>
            </tr>
          );
        })}
        <tr>
          <td>
            <b>Total</b>
          </td>
          <td>{cH}</td>
          <td>{cC}</td>
          <td>{total}</td>
        </tr>
      </tbody>
    </table>
  );
}

function rankNoteHtml(rank) {
  const merged = rank === "genus" ? 0 : CATS.length - new Set(CATS.map((c) => taxonAt(rank, c.name))).size;
  const base = `Analysing at <b>${RANKS[rank].label}</b>, ${fmt(featureCount(rank))} features. `;
  if (rank === "genus") {
    return base + "Genus is the finest rank this table supports reliably and it is where the CRC literature reports its markers, so it is what I recommend.";
  }
  const tail =
    rank === "phylum"
      ? ", which collapses most of the panel into Firmicutes and Bacteroidetes. You gain power from fewer tests and lose the ability to name a marker, and the CRC signal in this cohort is genus-level."
      : ". Family keeps some resolution while cutting the multiple-testing burden roughly in half.";
  return base + `${merged} of the top composition categories merge at this rank${tail}`;
}
