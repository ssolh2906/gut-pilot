// BarChart.jsx — vertical bar chart, ported from the mock's drawDepth()
// (QC page). Generic over `bars` so it's reusable wherever the mock draws a
// plain bar plot; pass a `threshold` to get the dashed reference line (the
// QC depth floor). Takes `svgRef` from the parent (rather than owning one)
// so the parent's block-head can wire it into <ChartTools> next to the title.
import { scaleLinear, tickFractions } from "./chartHelpers";

const W = 900;
const H = 232;
const L = 58;
const R = 12;
const T = 12;
const B = 36;

export default function BarChart({
  svgRef,
  bars, // [{ id, value, color, tip, flagged }], already in display order
  threshold, // { value, label } | undefined — dashed reference line
  yAxisLabel,
  xAxisLabel,
  formatValue = (n) => n.toLocaleString("en-US"),
}) {
  const pw = W - L - R;
  const ph = H - T - B;
  const maxV = Math.max(...bars.map((b) => b.value), threshold?.value ?? 0) * 1.06;
  const y = scaleLinear(0, maxV, T + ph, T); // inverted: larger value -> smaller y
  const bw = pw / bars.length;

  return (
    <div className="plot wide">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={yAxisLabel}>
        {tickFractions(4).map((f) => {
          const yy = T + ph - f * ph;
          return (
            <g key={f}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} className="gl" />
              <text x={L - 8} y={yy + 3.5} textAnchor="end" fontSize="10">
                {formatValue(Math.round(maxV * f))}
              </text>
            </g>
          );
        })}

        {threshold && (
          <>
            <line
              x1={L}
              x2={W - R}
              y1={y(threshold.value)}
              y2={y(threshold.value)}
              stroke="var(--color-warn)"
              strokeWidth="1.3"
              strokeDasharray="5 4"
            />
            <text x={L + 6} y={y(threshold.value) - 6} fontSize="10" fill="var(--color-warn)">
              {threshold.label}
            </text>
          </>
        )}

        {bars.map((b, i) => (
          <rect
            key={b.id}
            x={L + i * bw + bw * 0.16}
            y={y(b.value)}
            width={bw * 0.68}
            height={ph - (y(b.value) - T)}
            rx="2"
            className="bar"
            fill={b.color}
            fillOpacity={b.flagged ? 0.92 : 0.86}
            data-tip={b.tip}
          />
        ))}

        <line x1={L} x2={L} y1={T} y2={H - B} className="ax" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="ax" />
        {xAxisLabel && (
          <text x={L} y={H - 8} fontSize="10">
            {xAxisLabel}
          </text>
        )}
        {yAxisLabel && (
          <text
            x="16"
            y={T + ph / 2}
            textAnchor="middle"
            fontSize="10"
            transform={`rotate(-90 16 ${T + ph / 2})`}
          >
            {yAxisLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
