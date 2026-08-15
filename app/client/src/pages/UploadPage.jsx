// UploadPage.jsx — ported from data-page="upload" in gut-pilot_mock_260814.html
//
// Comments here explain each piece as it appears — read top to bottom once.

import { useState } from "react";

// SCHEMA_ITEMS is just data — pulling it out of the JSX like this means the
// list itself (the .map() below) doesn't need to change if the wording
// changes. This is a common React pattern: separate "the data" from "the
// markup that displays the data."
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

// `onComplete` is a prop — a function passed down from App.jsx, called when
// this page's job is done. This is how a child component talks back to its
// parent: it can't reach into App's state directly, so App hands it a
// callback instead.
export default function UploadPage({ onComplete }) {
  const [fileName, setFileName] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    setIsUploading(true);
    // Stand-in for a real upload — replace with an actual fetch() to your
    // backend once it exists. onComplete() is what advances App to the
    // next page.
    setTimeout(() => {
      setIsUploading(false);
      onComplete?.();
    }, 900);
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Upload your abundance table</h1>
        <p className="text-sm text-ink-2 mt-1 max-w-[70ch]">
          A taxa by samples count table. Sequencing and taxonomy assignment happen
          upstream, so this expects QC'd reads only.
        </p>
      </div>

      {/* grid-cols-[1.45fr_1fr] matches the mock's upload-grid CSS exactly —
          Tailwind lets you write arbitrary values in square brackets when
          there's no named utility for it. */}
      <div className="grid grid-cols-1 md:grid-cols-[1.45fr_1fr] gap-4">
        <div
          className={`border-[1.5px] border-dashed rounded-2xl p-11 text-center flex flex-col items-center gap-3 cursor-pointer transition-colors bg-surface
            ${isDragging ? "border-accent bg-accent-soft" : "border-line-2"}`}
          onClick={() => document.getElementById("file-input").click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
        >
          <h3 className="text-[15px] font-medium">
            Drop <span className="font-mono">genus_count_table.tsv</span> here
          </h3>
          <p className="text-xs text-ink-2">or click to browse. CSV and TSV, delimiter auto-detected.</p>
          <button
            type="button"
            className="mt-1 px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-ink transition-colors"
          >
            Browse files
          </button>
          <input
            id="file-input"
            type="file"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {/* Conditional rendering again — nothing renders here at all
              until isUploading is true. */}
          {isUploading && (
            <div className="flex flex-col items-center gap-2 mt-1">
              <div className="w-56 h-[5px] rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-accent rounded-full animate-pulse w-full" />
              </div>
              <div className="text-[11px] font-mono text-ink-2">
                Parsing rows, extracting genus from lineage
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface border border-line rounded-2xl p-4">
          <h3 className="text-sm font-semibold">Expected schema</h3>
          <p className="text-xs text-ink-2 mt-1">Matches the loader contract already in the pipeline.</p>
          <div className="flex flex-col gap-3 mt-3">
            {/*
              This is the list-rendering pattern from earlier, now with a
              real `key` prop — React needs a stable unique key on every
              item in a list so it can track which is which across
              re-renders. Using the array index as the key is fine here
              because this list never reorders or changes length.
            */}
            {SCHEMA_ITEMS.map((item, i) => (
              <div key={i} className="flex gap-2 text-xs text-ink-1">
                <span className="text-good mt-0.5">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 items-center bg-surface border border-line-2 rounded-xl pl-4 pr-1.5 py-1.5">
        <input
          type="text"
          placeholder="Optional. Tell the reviewer what to watch for, for example flag low-depth samples"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-3"
        />
        <button className="px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-3 rounded-lg">
          Send
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTION_CHIPS.map((label) => (
          <button
            key={label}
            className="text-xs px-3 py-1.5 rounded-full border border-line text-ink-2 hover:border-accent hover:text-accent-ink hover:bg-accent-soft transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {fileName && !isUploading && (
        <div className="text-xs font-mono text-ink-2">Selected: {fileName}</div>
      )}
    </section>
  );
}
