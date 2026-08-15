// Reveal.jsx — the "run the next step" button from the mock's progressive
// disclosure pattern. Renders a dashed button with a title/subtitle and a
// step badge; on click it plays the fill-bar animation, then calls
// onReveal(). The parent owns whether the revealed block is shown (via
// AppState's `revealed` map) — this component only owns its own
// click-to-running-to-done animation.
import { useState } from "react";

const ChevronIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M7 5l6 5-6 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Reveal({ title, subtitle, stepLabel, onReveal }) {
  const [running, setRunning] = useState(false);

  function handleClick() {
    if (running) return;
    setRunning(true);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => onReveal(), reduce ? 60 : 640);
  }

  return (
    <button type="button" className={"reveal" + (running ? " running" : "")} onClick={handleClick}>
      <span className="rv-mark">
        <ChevronIcon />
      </span>
      <span className="rv-txt">
        <b>{title}</b>
        <span>{subtitle}</span>
      </span>
      {stepLabel && <span className="rv-key">{stepLabel}</span>}
      <span className="rv-bar" />
    </button>
  );
}
