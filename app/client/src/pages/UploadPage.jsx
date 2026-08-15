// UploadPage.jsx — ported from data-page="upload" in gut-pilot_mock_260814.html.
//
// This is a demo upload: there's no real backend yet (that's next: Python +
// FastAPI, with the reviewer's reasoning driven by the Claude SDK). Clicking
// browse/drop/send just plays the mock's staged progress animation, then
// records the first decision-log entry and advances to Study design — same
// as the mock's runUpload().
import { useRef, useState } from "react";
import { useAppState } from "../state/AppStateContext";

const SCHEMA_ITEMS = [
  <>Column 1 is the full taxonomy lineage, for example <span className="font-mono">Bacteria;…;Genus</span></>,
  <>Columns 2 to N are integer counts, one per sample</>,
  <>An optional trailing <span className="font-mono">total</span> column is dropped on load</>,
  <>Optional <span className="font-mono">metadata.tsv</span> with <span className="font-mono">sample_id, group, batch</span></>,
];

const SUGGESTION_CHIPS = [
  "Flag low-depth samples",
  "Check for kit contamination",
  "Compare Healthy against CRC",
  "Recommend a rarefaction depth",
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
const AskIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 text-ink-3 flex-none">
    <path d="M4 4h16v12H8l-4 4V4Z" strokeLinejoin="round" />
  </svg>
);

export default function UploadPage() {
  const { actions } = useAppState();
  const [fileName, setFileName] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [askValue, setAskValue] = useState("");
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  function runUpload(file) {
    if (isUploading) return;
    if (file) setFileName(file.name);
    setIsUploading(true);
    setProgress(0);
    let p = 0;
    timerRef.current = setInterval(() => {
      p += 14 + Math.random() * 11;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(timerRef.current);
        setTimeout(() => {
          setIsUploading(false);
          actions.addLog({
            page: "upload",
            conf: 99,
            src: "schema validator",
            text: "Loaded genus_count_table.tsv. 24 sample columns and 187 genus rows, delimiter detected as tab. No metadata file supplied.",
          });
          actions.advanceTo("design");
        }, 240);
      }
    }, 120);
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
              runUpload();
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
            Drop <span className="font-mono">genus_count_table.tsv</span> here
          </h3>
          <p className="text-xs text-ink-2">or click to browse. CSV and TSV, delimiter auto-detected.</p>
          <button
            type="button"
            className="btn btn-primary mt-1"
            onClick={(e) => {
              e.stopPropagation();
              runUpload();
            }}
          >
            Browse files
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {isUploading && (
            <div className="flex flex-col items-center gap-2 mt-1">
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${progress}%` }} />
              </div>
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

      <div className="flex gap-2.5 items-center bg-surface border border-line-2 rounded-xl pl-3.5 pr-1.5 py-1.5">
        <AskIcon />
        <input
          type="text"
          value={askValue}
          onChange={(e) => setAskValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runUpload();
          }}
          placeholder="Optional. Tell the reviewer what to watch for, for example flag low-depth samples"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-3 min-w-0"
        />
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => runUpload()}>
          Send
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTION_CHIPS.map((label) => (
          <button key={label} type="button" className="chip" onClick={() => setAskValue(label)}>
            {label}
          </button>
        ))}
      </div>

      {fileName && !isUploading && <div className="text-xs font-mono text-ink-2">Selected: {fileName}</div>}
    </section>
  );
}
