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
import { useMemo, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useAutoProceed } from "../hooks/useAutoProceed";
import { getRank, setRank as postRank, getStudyDesign } from "../lib/api";
import Reveal from "../components/Reveal";
import { OptRow, Opt, GateNote, ConfBadge } from "../components/Gate";
import Spinner from "../components/Spinner";
import { samples, groupName, fmt, groupColor } from "../lib/data";

const RANK_LABEL = { phylum: "Phylum", family: "Family", genus: "Genus" };
const G2_LABEL = { covariate: "Include batch as a covariate", stratify: "Stratify permutations by batch", none: "Proceed and record the risk" };

export default function DesignPage() {
  const { state, actions } = useAppState();
  const { design } = state;
  const sd = state.studyDesignGate;
  const g4 = state.g4Gate;

  // samples is a mutated singleton (toggleSampleGroup edits it in place),
  // so groupVersion is what actually needs to trigger recomputation here.
  // Only used for the manual/none sample-chip grid below — G1's actual
  // recommendation and group counts come from real metadata (sd.g1) once
  // revealed; wiring the chip grid itself to real per-sample group labels
  // is a further, separate step not built this pass.
  const counts = useMemo(() => {
    const h = samples.filter((s) => s.group === "H").length;
    return { h, c: samples.length - h };
  }, [state.groupVersion]);

  // ---- G1+G2+G3 (study design) — one combined live Claude + Paperclip
  // call (reasoning/study_design.py), same Reveal-gated pattern as G4/G6.
  const [sdLoading, setSdLoading] = useState(false);
  const [sdError, setSdError] = useState(null);
  const [groupSource, setGroupSource] = useState(design.groupSource);
  const [batchHandling, setBatchHandling] = useState(design.batchHandling);
  const [pairing, setPairing] = useState(design.pairing);

  async function fetchStudyDesign() {
    if (!state.sessionId) {
      setSdError("No active session yet — go back to Upload first so the backend has a dataset loaded.");
      return;
    }
    setSdLoading(true);
    setSdError(null);
    try {
      const data = await getStudyDesign(state.sessionId);
      actions.setStudyDesignGate(data);
      setGroupSource("inferred"); // "inferred" = the recommended/metadata-based option (see Opt below)
      setBatchHandling(data.g2.recommendation.option_id);
      setPairing(data.g3.recommendation.option_id);
    } catch (e) {
      setSdError(e.message);
    } finally {
      setSdLoading(false);
    }
  }

  // ---- G4 (taxonomic rank) — its own separate live Claude + Paperclip
  // call, independent decision from G1-G3 above.
  const [g4Loading, setG4Loading] = useState(false);
  const [g4Error, setG4Error] = useState(null);
  const [selectedRank, setSelectedRank] = useState(g4?.rank ?? null);
  const [confirming, setConfirming] = useState(false);

  async function fetchG4() {
    if (!state.sessionId) {
      setG4Error("No active session yet — go back to Upload first so the backend has a dataset loaded.");
      return;
    }
    setG4Loading(true);
    setG4Error(null);
    try {
      const data = await getRank(state.sessionId);
      actions.setG4Gate(data);
      setSelectedRank(data.rank);
    } catch (e) {
      setG4Error(e.message);
    } finally {
      setG4Loading(false);
    }
  }

  async function confirm() {
    setConfirming(true);
    // Only hits the backend (a second real Claude call) if the user actually
    // picked a different rank than the session's current one — never an
    // automatic/auto-proceed-triggered call.
    if (g4 && selectedRank && selectedRank !== g4.rank && state.sessionId) {
      try {
        const data = await postRank(state.sessionId, selectedRank);
        actions.setG4Gate(data);
        actions.setG6Gate(null); // G4 invalidates G6 (docs/gates.md's invalidation table) — clear the stale cache
      } catch (e) {
        setG4Error(e.message);
        setConfirming(false);
        return;
      }
    }
    setConfirming(false);

    // Sync the reducer's `design` so other pages (Alpha/Beta read
    // design.singleCohort) see the actual confirmed choice, whether or not
    // G1-G3 were ever revealed.
    actions.setGroupSource(groupSource);
    actions.setBatchHandling(batchHandling);
    actions.setPairing(pairing);

    const finalRank = g4 && selectedRank ? selectedRank : "genus";
    const finalFeatureCount = g4?.ranks?.find((r) => r.option_id === finalRank)?.feature_count;
    const singleCohort = groupSource === "none";

    actions.confirmDesign();
    actions.addLog({
      key: "g1",
      page: "design",
      human: true,
      src: "human-in-the-loop",
      text: singleCohort
        ? "Confirmed single-cohort mode. No grouping variable, so all group comparisons are disabled for this run."
        : sd
          ? `Confirmed the grouping (${sd.g1.selected_column}, from metadata): ${Object.entries(sd.g1.group_counts).map(([k, v]) => `${k} ${v}`).join(", ")}.` +
            (sd.g1.excluded_levels?.length ? ` Excluded from the comparison: ${sd.g1.excluded_levels.join(", ")}.` : "")
          : `Confirmed the grouping (${groupSource === "inferred" ? "inferred from sample ID prefix" : "assigned manually"}): Healthy ${counts.h} against CRC ${counts.c}.`,
    });
    actions.addLog({
      key: "g2",
      page: "design",
      human: true,
      src: "human-in-the-loop",
      text: sd
        ? `Batch handling: ${sd.g2.status.replace(/_/g, " ").toLowerCase()} — ${G2_LABEL[batchHandling]}.`
        : `Batch handling set to ${G2_LABEL[batchHandling]}.`,
    });
    actions.addLog({
      key: "g3",
      page: "design",
      human: true,
      src: "human-in-the-loop",
      text: sd
        ? `Samples declared ${pairing === "paired" ? "paired/clustered" : "independent"} (${sd.g3.n_subjects} subjects, ${sd.g3.n_samples} samples).`
        : `Samples declared ${pairing === "paired" ? "paired or repeated measures, so tests use Wilcoxon signed-rank" : "independent, so tests use Wilcoxon rank-sum"}.`,
    });
    actions.addLog({
      key: "g4",
      page: "design",
      human: true,
      src: "human-in-the-loop",
      text: finalFeatureCount
        ? `Analysis rank set to ${RANK_LABEL[finalRank]}, ${fmt(finalFeatureCount)} features.`
        : `Analysis rank set to ${RANK_LABEL[finalRank]}.`,
    });
    actions.advanceTo("qc");
  }

  // Ready regardless of whether G4 was ever revealed — auto-proceed must
  // never trigger a live paid call on its own; it only ever uses whatever
  // rank data (or lack of it) is already there, same as a manual confirm
  // click would if G4 was never opened.
  const autoPending = useAutoProceed(true, confirm);

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div>
          <h1>Study design</h1>
          <p className="lede">What is actually being compared. Nothing downstream means anything until this is right, so the reviewer proposes and you confirm.</p>
        </div>
      </div>

      {!sd && !sdLoading && (
        <Reveal
          title="Ask the reviewer about study design"
          subtitle="One live call to Claude covering group definition, batch confounding, and sample independence together — grounded in this run's real metadata, takes 30–60 seconds"
          stepLabel="step 1 of 1"
          onReveal={fetchStudyDesign}
        />
      )}

      {sdLoading && (
        <div className="block appear">
          <div className="block-body pad-t text-sm text-ink-2 flex items-center gap-2.5">
            <Spinner />
            Reviewer is checking the real metadata for a grouping variable, testing for batch confounding, and verifying sample independence — this takes a little while.
          </div>
        </div>
      )}

      {sdError && (
        <div className="gate-note warn flex items-center gap-2.5">
          <span>{sdError}</span>
          <button type="button" className="btn btn-sm" onClick={fetchStudyDesign}>
            Retry
          </button>
        </div>
      )}

      {sd && (
        <>
          {/* G1 */}
          <div className="block gate">
            <div className="block-head">
              <div>
                <h2>Group definition</h2>
                <p className="sub">Metadata column <span className="font-mono">{sd.g1.selected_column}</span> identified as the comparison variable. Check it before continuing.</p>
              </div>
              <ConfBadge>{sd.g1.recommendation.label}</ConfBadge>
            </div>
            <div className="block-body">
              <OptRow>
                <Opt pressed={groupSource === "inferred"} recommended={sd.g1.recommendation.option_id === "metadata"} onClick={() => setGroupSource("inferred")} title="Use the metadata grouping">
                  {sd.g1.selected_column}: {Object.entries(sd.g1.group_counts).map(([k, v]) => `${k} ${v}`).join(", ")}
                </Opt>
                <Opt pressed={groupSource === "manual"} onClick={() => setGroupSource("manual")} title="Assign groups manually">
                  Edit the assignment sample by sample
                </Opt>
                <Opt pressed={groupSource === "none"} onClick={() => setGroupSource("none")} title="No grouping, single cohort">
                  Descriptive panels only, all group comparisons disabled
                </Opt>
              </OptRow>

              {groupSource === "manual" && (
                <div className="assign">
                  {samples.map((s) => (
                    <span
                      key={s.id}
                      className="sid editable"
                      onClick={() => actions.toggleSampleGroup(s.id)}
                      data-tip={`${s.id}|group=${groupName(s.group)}|reads=${fmt(s.depth)}|Click to switch group`}
                    >
                      <i style={{ background: groupColor(s.group) }} />
                      {s.id}
                    </span>
                  ))}
                </div>
              )}

              <GateNote
                variant={groupSource === "none" ? "warn" : undefined}
                html={
                  groupSource === "none"
                    ? "<b>Single-cohort mode.</b> Every group comparison is switched off: alpha diversity group tests, PERMANOVA, and differential abundance. The descriptive panels still run, so you keep depth, composition, per-sample alpha and the distance matrix. This is a supported mode, not a degraded one, but it does mean this run cannot answer a Healthy against CRC question."
                    : groupSource === "manual"
                      ? `Manual assignment. Click any sample to move it between groups. Current split: <b>Healthy ${counts.h}</b> and <b>CRC ${counts.c}</b>.`
                      : sd.g1.note_message
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
                  {sd.g2.status === "NO_BATCH_VARIABLE_FOUND"
                    ? "No usable technical/batch column was found in the real metadata."
                    : "Batch that tracks group membership is the most common way a disease signal turns out to be a processing signal."}
                </p>
              </div>
              <ConfBadge>{sd.g2.recommendation.label}</ConfBadge>
            </div>
            <div className="block-body">
              <GateNote
                variant={sd.g2.status === "CLEAN" || sd.g2.status === "NO_BATCH_VARIABLE_FOUND" ? "good" : "warn"}
                html={
                  sd.g2.note_message +
                  (sd.g2.citation?.quote
                    ? ` <span class="mono">(${sd.g2.citation.ref_key}, ${sd.g2.citation.line_ref})</span>: "${sd.g2.citation.quote}"`
                    : "")
                }
              />
              <OptRow>
                <Opt pressed={batchHandling === "covariate"} recommended={sd.g2.recommendation.option_id === "covariate"} onClick={() => setBatchHandling("covariate")} title="Include batch as a covariate">
                  PERMANOVA models batch alongside group
                </Opt>
                <Opt pressed={batchHandling === "stratify"} recommended={sd.g2.recommendation.option_id === "stratify"} onClick={() => setBatchHandling("stratify")} title="Stratify permutations by batch">
                  Permutes within batch only
                </Opt>
                <Opt pressed={batchHandling === "none"} recommended={sd.g2.recommendation.option_id === "none"} onClick={() => setBatchHandling("none")} title="Proceed and record the risk">
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
              <ConfBadge>{sd.g3.recommendation.label}</ConfBadge>
            </div>
            <div className="block-body">
              <GateNote html={sd.g3.note_message} />
              <OptRow>
                <Opt pressed={pairing === "independent"} recommended={sd.g3.recommendation.option_id === "independent"} onClick={() => setPairing("independent")} title="Independent samples">
                  Wilcoxon rank-sum, unrestricted permutations
                </Opt>
                <Opt
                  pressed={pairing === "paired"}
                  recommended={sd.g3.recommendation.option_id === "paired"}
                  disabled={sd.g3.recommendation.option_id !== "paired"}
                  onClick={() => setPairing("paired")}
                  title="Paired or repeated measures"
                >
                  {sd.g3.recommendation.option_id === "paired"
                    ? "Wilcoxon signed-rank, subject-restricted permutations"
                    : sd.g3.subject_id_variable
                      ? `${sd.g3.subject_id_variable} shows no repeated subjects, so paired tests cannot be executed`
                      : "No subject identifier column was found, so paired tests cannot be executed"}
                </Opt>
              </OptRow>
            </div>
          </div>
        </>
      )}

      {/* G4 */}
      <div className="block gate">
        <div className="block-head">
          <div>
            <h2>Taxonomic rank</h2>
            <p className="sub">Higher ranks merge taxa. That buys statistical power and loses resolution, and the trade is worth seeing rather than reading about.</p>
          </div>
          {g4 && <ConfBadge>{g4.recommendation.label}</ConfBadge>}
        </div>
        <div className="block-body flex flex-col gap-3">
          {!g4 && !g4Loading && (
            <Reveal
              title="Ask the reviewer for a rank recommendation"
              subtitle="A live call to Claude, grounded in citations it verifies via Paperclip — takes 30–60 seconds"
              stepLabel="step 1 of 1"
              onReveal={fetchG4}
            />
          )}

          {g4Loading && (
            <p className="text-sm text-ink-2 flex items-center gap-2.5">
              <Spinner />
              Reviewer is weighing the rank trade-off against this dataset's real feature counts and verifying its citation live — this takes a little while.
            </p>
          )}

          {g4Error && (
            <div className="gate-note warn flex items-center gap-2.5">
              <span>{g4Error}</span>
              <button type="button" className="btn btn-sm" onClick={fetchG4}>
                Retry
              </button>
            </div>
          )}

          {g4 && (
            <>
              <OptRow>
                {g4.ranks.map((r) => (
                  <Opt
                    key={r.option_id}
                    pressed={selectedRank === r.option_id}
                    recommended={r.option_id === g4.recommendation.option_id}
                    disabled={!r.available}
                    onClick={() => setSelectedRank(r.option_id)}
                    title={r.label}
                  >
                    <span className="num">{fmt(r.feature_count)} features</span>
                  </Opt>
                ))}
              </OptRow>
              <GateNote variant={g4.warning ? "warn" : undefined} html={rankNoteHtml(g4)} />
            </>
          )}
        </div>
      </div>

      <div className="page-foot">
        <p className="hint flex items-center gap-2">
          {autoPending && <Spinner />}
          {autoPending
            ? "Reviewer confirming the recommended design…"
            : groupSource === "none"
              ? "Continuing in single-cohort mode. Group comparisons stay disabled for the rest of the run."
              : "Confirming records these four choices in the decision log. You can come back and change them."}
        </p>
        <button type="button" className="btn btn-primary btn-lg" disabled={confirming} onClick={confirm}>
          {confirming ? "Confirming…" : "Confirm design and continue"}
        </button>
      </div>
    </section>
  );
}

// g4 is the real backend response (build_g4_response's shape) - rationale
// and citation come from Claude's live reasoning, not hardcoded copy.
function rankNoteHtml(g4) {
  const current = g4.ranks.find((r) => r.option_id === g4.rank);
  const base = `Analysing at <b>${current?.label ?? g4.rank}</b>${current ? `, ${fmt(current.feature_count)} features` : ""}. `;
  const citation = g4.recommendation.citations?.[0];
  const quoteHtml = citation?.quote
    ? ` <span class="mono">(${citation.ref_key}, ${citation.line_ref})</span>: "${citation.quote}"`
    : "";
  return base + g4.recommendation.rationale + quoteHtml;
}
