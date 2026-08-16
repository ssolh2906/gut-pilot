import { useState } from "react";
import UploadPage from "./pages/UploadPage";
import DesignPage from "./pages/DesignPage";
import QcPage from "./pages/QcPage";
import NormalizationPage from "./pages/NormalizationPage";
import AlphaPage from "./pages/AlphaPage";
import BetaPage from "./pages/BetaPage";
import DaPage from "./pages/DaPage";
import RefsPage from "./pages/RefsPage";
import Tooltip from "./components/Tooltip";
import DecisionLogDrawer, { DecisionLogRail } from "./components/DecisionLog";
import FloatingChat from "./components/FloatingChat";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { AppStateProvider, useAppState } from "./state/AppStateContext";
import { PAGES } from "./lib/pages";

const BrandMark = () => (
  <svg viewBox="0 0 26 26" fill="none" aria-hidden="true" width="26" height="26">
    <rect x=".8" y=".8" width="24.4" height="24.4" rx="7" fill="var(--color-accent)" />
    <circle cx="8.6" cy="10" r="2" fill="#fff" />
    <circle cx="17.6" cy="8.4" r="2" fill="#fff" fillOpacity=".82" />
    <circle cx="16.8" cy="17.6" r="2" fill="#fff" fillOpacity=".66" />
    <path d="M8.6 10L17.6 8.4M8.6 10l8.2 7.6M17.6 8.4l-.8 9.2" stroke="#fff" strokeOpacity=".6" strokeWidth="1.1" />
  </svg>
);
const ThemeIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="10" cy="10" r="3.6" />
    <path
      d="M10 1.6v2M10 16.4v2M1.6 10h2M16.4 10h2M4.1 4.1l1.4 1.4M14.5 14.5l1.4 1.4M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4"
      strokeLinecap="round"
    />
  </svg>
);
const LockIcon = () => (
  <svg className="lock" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12">
    <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
    <path d="M7 8.5V6.5a3 3 0 0 1 6 0v2" />
  </svg>
);

function useTheme() {
  const [theme, setTheme] = useState(null); // null = follow system
  function toggle() {
    const sysDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = theme || (sysDark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  }
  return toggle;
}

function TabBar() {
  const { state, actions } = useAppState();
  const currentIdx = PAGES.findIndex((p) => p.id === state.currentPage);
  return (
    <nav className="border-t border-line bg-bg-rail" aria-label="Analysis pages">
      <div className="max-w-[1480px] mx-auto px-5 flex gap-0.5 overflow-x-auto">
        {PAGES.map((page, i) => {
          const isLocked = i > state.unlocked;
          const isCurrent = page.id === state.currentPage;
          const isDone = i < currentIdx;
          return (
            <button
              key={page.id}
              type="button"
              disabled={isLocked}
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => actions.goPage(page.id)}
              className={`relative flex-none flex items-center gap-2 h-11 px-3.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors
                ${isCurrent ? "text-accent-ink border-accent" : "border-transparent text-ink-2"}
                ${isLocked ? "text-ink-3 opacity-55 cursor-not-allowed" : "hover:text-ink-0"}`}
            >
              <span
                className={`w-[19px] h-[19px] rounded-full border-[1.4px] flex items-center justify-center text-[10px] font-mono font-bold border-current
                  ${isDone ? "bg-good border-good text-white" : ""}
                  ${isCurrent ? "bg-accent border-accent text-white" : ""}`}
              >
                {isDone ? "✓" : page.n}
              </span>
              {page.label}
              {isLocked && <LockIcon />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function AppShell() {
  const { state } = useAppState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleTheme = useTheme();

  return (
    <div className="min-h-screen">
      <Tooltip />

      <header className="sticky top-0 z-50 bg-surface/88 backdrop-blur-md border-b border-line">
        <div className="max-w-[1480px] mx-auto h-13 flex items-center gap-3.5 px-5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark />
            <b className="text-[14.5px] font-semibold tracking-tight whitespace-nowrap">Gut Pilot</b>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="ds-chip">
              <i />
              {state.sessionMeta ? (
                <>
                  {state.sessionMeta.label} <span className="font-mono">· {state.sessionMeta.n_samples} samples</span>
                </>
              ) : (
                "No dataset loaded yet"
              )}
            </div>
            <button type="button" className="icon-btn" aria-label="Toggle colour theme" title="Toggle light and dark" onClick={toggleTheme}>
              <ThemeIcon />
            </button>
          </div>
        </div>
        <TabBar />
      </header>

      <div className="max-w-[1480px] mx-auto px-5 py-6.5 pb-30">
        {state.currentPage === "upload" && <UploadPage />}
        {state.currentPage === "design" && <DesignPage />}
        {state.currentPage === "qc" && <QcPage />}
        {state.currentPage === "rarefy" && <NormalizationPage />}
        {state.currentPage === "alpha" && <AlphaPage />}
        {state.currentPage === "beta" && <BetaPage />}
        {state.currentPage === "da" && <DaPage />}
        {state.currentPage === "refs" && <RefsPage />}
      </div>

      <DecisionLogRail log={state.log} onClick={() => setDrawerOpen(true)} />
      <DecisionLogDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} log={state.log} />
      <FloatingChat />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppStateProvider>
        <AppShell />
      </AppStateProvider>
    </AppErrorBoundary>
  );
}
