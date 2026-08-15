import { useState } from "react";
import UploadPage from "./pages/UploadPage";

// The full page list from the mock, in order. `locked` pages can't be
// clicked into until the flow reaches them — matches the mock's
// .ptab:disabled behavior.
const PAGES = [
  { key: "upload", label: "Upload" },
  { key: "design", label: "Study design" },
  { key: "qc", label: "QC" },
  { key: "rarefy", label: "Rarefaction" },
  { key: "alpha", label: "Alpha diversity" },
  { key: "beta", label: "Beta diversity" },
  { key: "da", label: "Differential abundance" },
  { key: "refs", label: "References" },
];

export default function App() {
  // This one variable is the entire "routing" story for this app — see
  // the earlier discussion on why a router isn't needed here. Changing
  // this string is what "navigates," and the tab bar below just reflects
  // whichever value it currently holds.
  const [currentPage, setCurrentPage] = useState("upload");

  // Tracks how far the user has actually progressed, so later tabs stay
  // disabled until earned — same idea as the mock's aria-current/:disabled
  // tab states.
  const [furthestUnlocked, setFurthestUnlocked] = useState(0);
  const currentIndex = PAGES.findIndex((p) => p.key === currentPage);

  function goToPage(key) {
    const idx = PAGES.findIndex((p) => p.key === key);
    if (idx > furthestUnlocked) return; // locked — do nothing
    setCurrentPage(key);
  }

  function advanceFrom(key) {
    const idx = PAGES.findIndex((p) => p.key === key);
    setFurthestUnlocked((prev) => Math.max(prev, idx + 1));
    if (PAGES[idx + 1]) setCurrentPage(PAGES[idx + 1].key);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-[1480px] mx-auto h-13 flex items-center gap-3 px-5 py-3">
          <b className="text-sm tracking-tight">Gut Pilot</b>
          <span className="text-[10.5px] font-mono text-ink-3 border-l border-line-2 pl-2.5 ml-0.5">
            THE SKEPTICAL REVIEWER
          </span>
        </div>
        <nav className="border-t border-line bg-bg-rail">
          <div className="max-w-[1480px] mx-auto px-5 flex gap-0.5 overflow-x-auto">
            {PAGES.map((page, i) => {
              const isLocked = i > furthestUnlocked;
              const isCurrent = page.key === currentPage;
              return (
                <button
                  key={page.key}
                  disabled={isLocked}
                  onClick={() => goToPage(page.key)}
                  className={`flex items-center gap-2 h-11 px-3.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors
                    ${isCurrent ? "text-accent-ink border-accent" : "border-transparent text-ink-2"}
                    ${isLocked ? "text-ink-3 opacity-55 cursor-not-allowed" : "hover:text-ink-0"}`}
                >
                  <span
                    className={`w-[19px] h-[19px] rounded-full border-[1.4px] flex items-center justify-center text-[10px] font-mono font-bold
                      ${isCurrent ? "bg-accent border-accent text-white" : i < furthestUnlocked ? "bg-good border-good text-white" : ""}`}
                  >
                    {i < furthestUnlocked ? "✓" : i + 1}
                  </span>
                  {page.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="max-w-[1480px] mx-auto px-5 py-7 pb-28">
        {currentPage === "upload" && (
          <UploadPage onComplete={() => advanceFrom("upload")} />
        )}
        {currentPage !== "upload" && (
          <div className="text-ink-2 text-sm">
            Page "{PAGES[currentIndex].label}" — not built yet.
          </div>
        )}
      </main>
    </div>
  );
}
