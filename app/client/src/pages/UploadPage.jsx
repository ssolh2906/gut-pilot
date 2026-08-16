// UploadPage.jsx — ported from data-page="upload" in gut-pilot_mock_260814.html.
//
// Real upload: dropping/selecting a .tar.gz (MicrobiomeHD format — same
// shape as the bundled crc_baxter/cdi_schubert datasets) sends it to the
// backend, which extracts and parses it for real (compute/ingestion.py) —
// not a staged animation. No file selected falls back to the bundled
// crc_baxter dataset instead (see lib/api.js's createSession). The mock's
// inline "ask the reviewer" box and suggestion chips live in the floating
// chat widget instead (see components/FloatingChat.jsx) — this page no
// longer has its own.
import { useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { createSession } from "../lib/api";
import { fmt } from "../lib/data";
import Spinner from "../components/Spinner";

const SCHEMA_ITEMS = [
  <>A <span className="font-mono">.tar.gz</span> in MicrobiomeHD format — an <span className="font-mono">RDP/*.rdp_assigned</span> OTU table plus a <span className="font-mono">*.metadata.txt</span> file</>,
  <>OTU table: taxonomy lineage as the first column, integer counts per sample in the rest</>,
  <>An optional trailing <span className="font-mono">total</span> column is dropped on load</>,
  <>Metadata sample IDs are reconciled against the count table — mismatches are flagged, never silently merged</>,
];

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-[15px] h-[15px] flex-none text-good mt-0.5">
    <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="w-11 h-11 text-accent" aria-hidden="true">
    <path
      d="M7 16a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5c0 .17 0 .34-.02.5A4 4 0 0 1 16 17H8a1 1 0 0 1-1-1Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 12v6m0-6 2.6 2.6M12 12 9.4 14.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export default function UploadPage() {
  const { state, actions } = useAppState();
  const [fileName, setFileName] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  function runUpload(file) {
    if (isUploading) return;
    if (file) setFileName(file.name);
    setError(null);
    setIsUploading(true);
    // Indeterminate — the spinner covers however long the real request
    // takes, no percentage to fake. isUploading only clears once the real
    // call actually resolves (success, HARD_STOP, or error), not before it.
    timerRef.current = setTimeout(async () => {
      // Real ingestion (compute/ingestion.py), no model call — a real
      // .tar.gz is genuinely extracted and parsed server-side; no file
      // falls back to the bundled crc_baxter dataset.
      let session;
      try {
        session = await createSession(file);
      } catch (e) {
        // Parse/validation failure (bad tarball, backend down, etc.) —
        // don't silently proceed with no data.
        setIsUploading(false);
        setError(e.message);
        return;
      }
      actions.setSessionId(session.session_id);

      const pr = session.parse_report;
      if (pr && pr.status === "HARD_STOP") {
        // Per research/01_ingestion.md: stop and ask on anything that
        // could change which observations enter the analysis, rather
        // than silently proceeding with a table that failed validation.
        setIsUploading(false);
        setError(`Upload didn't pass validation: ${pr.hard_stops.join("; ")}`);
        return;
      }

      setIsUploading(false);
      actions.addLog({
        page: "upload",
        conf: 99,
        src: "schema validator",
        text: pr
          ? `Loaded ${file ? file.name : "the crc_baxter dataset"}. ${fmt(pr.n_samples)} sample columns and ${fmt(pr.n_features)} feature rows.` +
            (pr.metadata.supplied ? ` Metadata joined for ${fmt(pr.metadata.matched_samples)}/${fmt(pr.n_samples)} samples.` : " No metadata file supplied.")
          : `Loaded ${file ? file.name : "the fixture dataset"}.`,
      });
      actions.advanceTo("design");
    }, 240);
  }

  function handleFile(file) {
    if (!file) return;
    runUpload(file);
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Upload your abundance table</h1>
        <p className="text-sm text-ink-2 mt-1 max-w-[70ch]">
          A taxa by samples count table. Sequencing and taxonomy assignment happen upstream, so this expects QC'd reads only.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.45fr_1fr] gap-4.5">
        <div
          className={`border-[1.5px] border-dashed rounded-2xl p-11 text-center flex flex-col items-center gap-2.5 cursor-pointer transition-colors bg-surface
            ${isDragging ? "border-accent bg-accent-soft" : "border-line-2"}`}
          role="button"
          tabIndex={0}
          aria-label="Upload count table"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFile(e.dataTransfer.files[0]);
          }}
        >
          <UploadIcon />
          <h3 className="text-[15px] font-medium">
            Drop a <span className="font-mono">.tar.gz</span> here
          </h3>
          <p className="text-xs text-ink-2">or click to browse. MicrobiomeHD format — same shape as crc_baxter/cdi_schubert.</p>
          <button
            type="button"
            className="btn btn-primary mt-1"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Browse files
          </button>
          <button
            type="button"
            className="btn btn-sm mt-1"
            onClick={(e) => {
              e.stopPropagation();
              runUpload(null);
            }}
          >
            Use bundled crc_baxter dataset
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".tar.gz,.tgz,application/gzip"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {isUploading && (
            <div className="flex flex-col items-center gap-2 mt-1">
              <Spinner size="lg" />
              <div className="text-[11px] font-mono text-ink-2">Parsing rows, extracting genus from lineage</div>
            </div>
          )}
        </div>

        <div className="block">
          <div className="block-head">
            <div>
              <h3>Expected schema</h3>
              <p className="sub">Matches the loader contract already in the pipeline.</p>
            </div>
          </div>
          <div className="block-body">
            <div className="flex flex-col gap-2.5">
              {SCHEMA_ITEMS.map((item, i) => (
                <div key={i} className="flex gap-2 text-xs text-ink-1">
                  <CheckIcon />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {fileName && !isUploading && !error && <div className="text-xs font-mono text-ink-2">Selected: {fileName}</div>}

      {error && (
        <div className="gate-note warn flex items-center gap-2.5">
          <span>{error}</span>
          <button type="button" className="btn btn-sm" onClick={() => { setError(null); setFileName(null); }}>
            Try a different file
          </button>
        </div>
      )}

      <div className="block">
        <div className="block-body pad-t flex items-center justify-between gap-4">
          <div>
            <h3>Proceed with recommended options</h3>
            <p className="sub mt-1">
              Every gate accepts the reviewer's recommended option and advances on its own — the same confirm/continue action a manual click would trigger, just without waiting for the click. You
              can still review and change any setting afterward.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.autoProceed}
            aria-label="Proceed with recommended options"
            onClick={() => actions.setAutoProceed(!state.autoProceed)}
            className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${state.autoProceed ? "bg-accent" : "bg-surface-3"}`}
          >
            <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${state.autoProceed ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>
    </section>
  );
}
