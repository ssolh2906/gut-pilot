// RefsPage.jsx — data-page="refs" in the mock, last page in the flow (no
// "continue" button — matches the mock). Scientific synthesis wired to the
// real backend: Claude integrates real alpha/beta/DA results freshly
// recomputed server-side (see app/server/reasoning/g_synthesis.py) into
// three sections per product direction — the full 7-section research/08
// spec is simplified down to what a reader actually needs here.
import { useEffect, useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { getSynthesis } from "../lib/api";
import Spinner from "../components/Spinner";
import { REF_INDEX, refLink, refShort } from "../lib/data";

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
    <path d="M12 3l1.8 4.3L18 9l-4.2 1.7L12 15l-1.8-4.3L6 9l4.2-1.7L12 3Z" strokeLinejoin="round" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" strokeLinejoin="round" />
  </svg>
);

// Every citation this run actually surfaced and verified, gathered from the
// already-cached gate responses rather than a static bibliography — a
// different run (different strategy/metric picks) would list a different
// set. Falls back gracefully if a gate was never fetched.
function collectSourceKeys(state) {
  const keys = new Set();
  state.g6Gate?.positions?.forEach((p) => p.ref_key && keys.add(p.ref_key));
  if (state.g8Gate?.citation?.ref_key) keys.add(state.g8Gate.citation.ref_key);
  if (state.g9Gate?.citation?.ref_key) keys.add(state.g9Gate.citation.ref_key);
  if (state.daGate?.citation?.ref_key) keys.add(state.daGate.citation.ref_key);
  if (state.studyDesignGate?.g2?.citation?.ref_key) keys.add(state.studyDesignGate.g2.citation.ref_key);
  const g4Citation = state.g4Gate?.recommendation?.citations?.[0]?.ref_key;
  if (g4Citation) keys.add(g4Citation);
  // The known-taxa cross-check table (research/fixtures/known_taxa_crc.csv)
  // is fixed content, not per-run reasoning output, but it only actually
  // gets used once the Differential page has run.
  if (state.daGate) {
    keys.add("thomas2019");
    keys.add("duvallet2017");
  }
  return [...keys].filter((k) => REF_INDEX[k]);
}

function SourceCard({ refKey }) {
  const r = REF_INDEX[refKey];
  const link = refLink(refKey);
  return (
    <div className="block" style={{ padding: "12px 14px" }}>
      <div className="text-sm font-medium">{r.title}</div>
      <div className="text-xs text-ink-2 mt-0.5">
        {r.authors} ({r.year}). <i>{r.journal}</i>.
      </div>
      <div className="text-xs text-ink-3 mt-1">{r.used}</div>
      {link && (
        <a className="cite mt-1.5 inline-block" href={link} target="_blank" rel="noopener noreferrer">
          {refShort(refKey)} ↗
        </a>
      )}
    </div>
  );
}

export default function RefsPage() {
  const { state, actions } = useAppState();
  const synth = state.synthesisGate;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchSynthesis() {
    if (!state.sessionId) {
      setError("No active session yet — go back to Upload first so the backend has a dataset loaded.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getSynthesis(state.sessionId);
      actions.setSynthesisGate(data);
      actions.addLog({
        key: "synthesis",
        page: "refs",
        conf: 90,
        src: "reviewer",
        text: "Synthesized alpha diversity, beta diversity, and differential abundance into one interpretation, validated against prior literature.",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || synth || !state.sessionId) return;
    fetchedRef.current = true;
    fetchSynthesis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId]);

  const sourceKeys = synth ? collectSourceKeys(state) : [];

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Run summary</h1>
          <p className="lede">What this run found, how it fits prior evidence, and what to check next — the scientific payoff, not a bibliography page.</p>
        </div>
      </div>

      {(loading || (!synth && !error)) && (
        <div className="block appear">
          <div className="block-body pad-t text-sm text-ink-2 flex items-center gap-2.5">
            <Spinner />
            Reviewer is integrating alpha diversity, beta diversity, and differential abundance into one interpretation and checking it against prior literature — this is the longest call in the
            run, so it takes a bit longer than a single gate note.
          </div>
        </div>
      )}

      {error && (
        <div className="gate-note warn flex items-center gap-2.5">
          <span>{error}</span>
          <button type="button" className="btn btn-sm" onClick={fetchSynthesis}>
            Retry
          </button>
        </div>
      )}

      {synth && (
        <>
          {/* ---------------------------------------------------------- 1. Summary & interpretation */}
          <div className="agent" style={{ alignItems: "flex-start" }}>
            <div className="av">
              <SparkleIcon />
            </div>
            <div style={{ flex: 1 }}>
              <h4>Summary &amp; interpretation</h4>
              <p style={{ fontSize: 15, fontWeight: 550, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: synth.hero_finding }} />
              <p className="mt-2" dangerouslySetInnerHTML={{ __html: synth.summary_text }} />
              <p className="mt-2" dangerouslySetInnerHTML={{ __html: synth.literature_validation_text }} />
            </div>
          </div>

          <div className="block">
            <div className="block-head">
              <div>
                <h3>Statistical Considerations</h3>
              </div>
            </div>
            <div className="block-body">
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {synth.limitations.map((l, i) => (
                  <div key={i} style={{ borderLeft: "2px solid var(--color-line-2)", paddingLeft: 12 }}>
                    <div className="text-sm font-medium">{l.title}</div>
                    <div className="text-xs text-ink-2 mt-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: l.body }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------- 2. Future research suggestions */}
          <div className="block">
            <div className="block-head">
              <div>
                <h2>Future research suggestions</h2>
                <p className="sub">Ranked by how much they'd actually change what we believe, not by technical elaborateness.</p>
              </div>
            </div>
            <div className="block-body flex flex-col gap-3">
              {synth.next_steps.map((step, i) => (
                <div key={i} className="block" style={{ padding: "12px 14px" }}>
                  <div className="flex items-center gap-2">
                    <span className="conf">{i + 1}</span>
                    <div className="text-sm font-semibold" dangerouslySetInnerHTML={{ __html: step.title }} />
                  </div>
                  <div className="text-xs text-ink-2 mt-1.5">
                    <b>Tests:</b> <span dangerouslySetInnerHTML={{ __html: step.hypothesis }} />
                  </div>
                  <div className="text-xs text-ink-1 mt-1 leading-relaxed">
                    <b>Next step:</b> <span dangerouslySetInnerHTML={{ __html: step.experiment }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---------------------------------------------------------- 3. Sources used in this run */}
          <div className="block">
            <div className="block-head">
              <div>
                <h2>Sources used in this run</h2>
                <p className="sub">Every citation this specific run actually surfaced and verified — a different strategy/metric choice would list a different set.</p>
              </div>
            </div>
            <div className="block-body">
              {sourceKeys.length === 0 ? (
                <p className="text-sm text-ink-3">No citations were verified in this run yet.</p>
              ) : (
                <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                  {sourceKeys.map((key) => (
                    <SourceCard key={key} refKey={key} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
