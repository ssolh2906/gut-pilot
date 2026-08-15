// Tooltip.jsx — one shared floating tooltip for the whole app, positioned
// via a delegated document-level mousemove listener rather than per-element
// state. This mirrors the mock exactly: any element (SVG shape, chip,
// sample badge, ...) can opt in just by carrying a `data-tip="..."`
// attribute, with no per-chart tooltip wiring needed. Mount this once,
// near the root.
import { useEffect, useRef } from "react";
import { tipHTML } from "../lib/tooltip";

export default function Tooltip() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function show(spec, x, y) {
      el.innerHTML = tipHTML(spec);
      el.classList.add("on");
      const r = el.getBoundingClientRect();
      let left = x;
      let top = y;
      if (left - r.width / 2 < 8) left = r.width / 2 + 8;
      if (left + r.width / 2 > innerWidth - 8) left = innerWidth - r.width / 2 - 8;
      if (top - r.height - 14 < 8) top = y + r.height + 26; // flip below cursor
      el.style.left = left + "px";
      el.style.top = top + "px";
    }
    function hide() {
      el.classList.remove("on");
    }
    function onMove(e) {
      const t = e.target.closest ? e.target.closest("[data-tip]") : null;
      if (!t) {
        hide();
        return;
      }
      show(t.getAttribute("data-tip"), e.clientX, e.clientY);
    }

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", hide);
    addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", hide);
      removeEventListener("scroll", hide);
    };
  }, []);

  return <div className="tip" ref={ref} role="status" aria-live="polite" />;
}
