// PageContextStrip.jsx — the "#ctxAlpha/#ctxBeta/#ctxDa" strip from the mock:
// one shared summary of normalization, sample count, groups, rank, and
// significance settings, shown identically on Alpha, Beta and DA (the mock
// renders the same string into all three by id). An "edit" link jumps back
// to Alpha, where G8 (significance) lives.
import { useAppState } from "../state/AppStateContext";
import { retained } from "../state/selectors";
import { RANKS } from "../lib/data";

const NORM_LABEL = { rarefy: "Rarefaction", css: "CSS scaling", clr: "CLR transform" };
const CORR_LABEL = { bh: "Benjamini-Hochberg", bonferroni: "Bonferroni", none: "no correction" };

export default function PageContextStrip() {
  const { state, actions } = useAppState();
  const kept = retained(state);
  const h = kept.filter((s) => s.group === "H").length;

  const norm =
    state.normStrategy === "rarefy" ? (
      <>
        Rarefied at <b>{state.threshold.toLocaleString("en-US")}</b> reads
      </>
    ) : (
      NORM_LABEL[state.normStrategy]
    );
  const groups = state.design.singleCohort ? (
    <b>Single cohort, group tests disabled</b>
  ) : (
    <>
      Healthy <b>{h}</b> against CRC <b>{kept.length - h}</b>
    </>
  );

  return (
    <div className="page-ctx">
      {norm} &nbsp;|&nbsp; <b>{kept.length}</b> samples &nbsp;|&nbsp; {groups} &nbsp;|&nbsp; {RANKS[state.rank].label} &nbsp;|&nbsp; alpha <b>{state.alphaLevel}</b>, {CORR_LABEL[state.correction]}{" "}
      <button type="button" className="ctx-edit" onClick={() => actions.goPage("alpha")}>
        edit
      </button>
    </div>
  );
}
