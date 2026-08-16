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
import { useEffect, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useAutoProceed } from "../hooks/useAutoProceed";
import { getAlphaDiversity } from "../lib/api";
import { adjustedP, sigCount, CORR_LABEL } from "../state/selectors";
import { OptRow, Opt, GateNote } from "../components/Gate";
import ChartTools from "../components/ChartTools";
import PageContextStrip from "../components/PageContextStrip";
import { fmt, refLink, refShort } from "../lib/data";

const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 9v4m0 3h.01M10.3 4.3 2.6 18a1.5 1.5 0 0 0 1.3 2.25h16.2A1.5 1.5 0 0 0 21.4 18L13.7 4.3a1.5 1.5 0 0 0-2.6 0Z" strokeLinejoin="round" />
  </svg>
);

function Dumbbells({ singleCohort, liveAlpha }) {
  if (singleCohort) {
    return (
      <GateNote
        variant="warn"
        html="<b>The group diversity comparison is unavailable in single-cohort mode.</b> No grouping variable was defined at the design gate, so there is nothing to compare against. The descriptive panels on this run still apply. To enable this, go back to Design and either supply metadata or assign groups manually."
      />
    );
  }
  const [groupA, groupB] = liveAlpha.comparison_groups ?? [];
  const labels = {
    Observed_taxa: "Observed genera",
    Shannon: "Shannon",
    Simpson: "Simpson",
    Chao1: "Chao1",
    Pielou_evenness: "Pielou evenness",
  };
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(liveAlpha.group_means).map(([metric, means]) => {
        const test = liveAlpha.significance[metric];
        return (
          <div className="db-row" key={metric}>
            <div className="l">{labels[metric] ?? metric}</div>
            <div className="text-xs font-mono text-ink-2">
              {groupA} {means[groupA]?.toFixed(3)} · {groupB} {means[groupB]?.toFixed(3)}
            </div>
            <div className={"p" + (test?.q_value < 0.05 ? " sig" : "")}>
              {test ? `p = ${test.p_value.toFixed(3)} · q = ${test.q_value.toFixed(3)}` : "descriptive only"}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-ink-3 mt-2">
        Real {liveAlpha.n_iterations}-iteration rarefaction result at {liveAlpha.depth.toLocaleString("en-US")} reads per sample.
      </p>
    </div>
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
  const [liveAlpha, setLiveAlpha] = useState(null);
  const [alphaError, setAlphaError] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!state.sessionId) return;
    let cancelled = false;
    setAlphaError(null);
    getAlphaDiversity(state.sessionId, state.correction)
      .then((data) => { if (!cancelled) setLiveAlpha(data); })
      .catch((error) => { if (!cancelled) setAlphaError(error.message); });
    return () => { cancelled = true; };
  }, [state.sessionId, state.correction, retryVersion]);

  function setAlphaLevel(value) {
    actions.setAlphaLevel(value);
    actions.addLog({ key: "g8", page: "alpha", human: true, src: "human-in-the-loop", text: `Significance settings: alpha = ${value} with ${CORR_LABEL[state.correction]}.` });
  }
  function setCorrection(value) {
    actions.setCorrection(value);
    actions.addLog({ key: "g8", page: "alpha", human: true, src: "human-in-the-loop", text: `Significance settings: alpha = ${state.alphaLevel} with ${CORR_LABEL[value]}.` });
  }

  useAutoProceed(!!liveAlpha, () => actions.advanceTo("beta"));

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Alpha diversity</h1>
          <p className="lede">Within-sample structure. Composition first, then the summary metrics, because the metrics are easy to over-read on their own.</p>
        </div>
      </div>
      <PageContextStrip />

      {!liveAlpha && !alphaError && <div className="block"><div className="block-body pad-t text-sm text-ink-2">Computing repeated-rarefaction alpha diversity on the uploaded cohort…</div></div>}
      {alphaError && (
        <div className="gate-note warn flex flex-wrap items-center gap-2.5">
          <span>Alpha diversity could not be computed: {alphaError}</span>
          <button type="button" className="btn btn-sm" onClick={() => setRetryVersion((value) => value + 1)}>
            Retry alpha analysis
          </button>
        </div>
      )}

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

      <div className="flex flex-col gap-5">
        <div className="agent flagged">
          <div className="av">
            <AlertIcon />
          </div>
          <div>
            <h4>Check your expectation, not just the p-value</h4>
            <p>
              A common prior is that the CRC gut has <b>lower diversity</b>. In this uploaded cohort, Shannon is {liveAlpha ? `p = ${liveAlpha.significance.Shannon?.p_value.toFixed(3)}` : "being computed"}, while observed richness is
              {liveAlpha && liveAlpha.group_means.Observed_taxa ? ` ${liveAlpha.group_means.Observed_taxa.CRC > liveAlpha.group_means.Observed_taxa.H ? "higher" : "lower"} in CRC` : " evaluated separately"}. Read this alongside beta diversity and taxon-level results rather than treating diversity as a diagnosis.
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
            <ChartTools name="alpha-diversity" getCsvRows={() => [["metric", "p", "q"], ...Object.entries(liveAlpha?.significance ?? {}).map(([metric, result]) => [metric, result?.p_value, result?.q_value])]} />
          </div>
          <div className="block-body pad-t">
            {liveAlpha ? <Dumbbells singleCohort={state.design.singleCohort} liveAlpha={liveAlpha} /> : <p className="text-sm text-ink-2">Waiting for the real cohort calculation.</p>}
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
