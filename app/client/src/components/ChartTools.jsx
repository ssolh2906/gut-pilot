// ChartTools.jsx — the small SVG / PNG / CSV download row that sits in a
// chart's block-head, ported from the mock's data-dl/data-csv chip
// generator. `svgRef` points at the chart's <svg>; `getCsvRows`, if given,
// is called lazily (only on click) so building the export doesn't cost
// anything on every render.
import { exportSvg, exportPng, download, toCsv } from "../lib/exportUtils";

const DlIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M8 2v8m0 0 3-3m-3 3L5 7M2.5 12.5h11" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function ChartTools({ svgRef, name, getCsvRows }) {
  return (
    <div className="chart-tools">
      {svgRef && (
        <>
          <button type="button" className="dl" onClick={() => exportSvg(svgRef.current, name)}>
            <DlIcon />
            SVG
          </button>
          <button type="button" className="dl" onClick={() => exportPng(svgRef.current, name, 2)}>
            <DlIcon />
            PNG
          </button>
        </>
      )}
      {getCsvRows && (
        <button
          type="button"
          className="dl"
          onClick={() => download(name + ".csv", toCsv(getCsvRows()), "text/csv;charset=utf-8")}
        >
          <DlIcon />
          CSV
        </button>
      )}
    </div>
  );
}
