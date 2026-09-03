import { useId, useRef, useState } from "react";
import { copyPlotPng, type PngLegendItem } from "../core/plotPng";

export interface Series { label: string; points: Array<{ x: number; y: number }>; color: string; dash?: boolean }
interface Props { title: string; series: Series[]; xMax?: number; yMin?: number; yMax?: number; vertical?: number[]; horizontal?: number[]; caption?: string }

export function LineChart({ title, series, xMax, yMin = 0, yMax = 100, vertical = [], horizontal = [], caption = "Solvent-composition program and calculated bounds." }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "blocked">("idle");
  const plotClipId = `bg2dlc-plot-${useId().replaceAll(":", "")}`;
  const all = series.flatMap((item) => item.points);
  const maxX = xMax ?? Math.max(1, ...all.map((point) => point.x));
  const visibleSeries = series.filter((item) => item.points.length > 0);
  const hasTimeBounds = vertical.some((x) => Number.isFinite(x) && x >= 0 && x <= maxX);
  const hasPhiBounds = horizontal.some((y) => Number.isFinite(y) && y >= yMin && y <= yMax);
  const width = 540, height = 280, m = { l: 52, r: 16, t: 14, b: 38 };
  const px = (x: number) => m.l + (x / Math.max(1e-12, maxX)) * (width - m.l - m.r);
  const py = (y: number) => m.t + (1 - (y - yMin) / Math.max(1e-12, yMax - yMin)) * (height - m.t - m.b);
  const copyPng = () => {
    const svg = svgRef.current; if (!svg) return;
    const legend: PngLegendItem[] = [
      ...visibleSeries.map((item) => ({ label: item.label, color: item.color, dashed: item.dash })),
      ...(hasTimeBounds ? [{ label: "Time bounds", color: "#9b88ff", dashed: true }] : []),
      ...(hasPhiBounds ? [{ label: "%B bounds", color: "#38a8ff", dashed: true }] : []),
    ];
    void copyPlotPng({ title, source: svg, legend, caption })
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("blocked"))
      .finally(() => window.setTimeout(() => setCopyState("idle"), 1800));
  };
  return <figure className="bg2dlc-chart-card">
    <div className="bg2dlc-chart-heading"><h3>{title}</h3><button type="button" className="bg2dlc-icon-button" aria-label={`Copy ${title} as PNG`} onClick={copyPng} disabled={!all.length}>{copyState === "copied" ? "Copied" : copyState === "blocked" ? "Copy blocked" : "Copy PNG"}</button></div>
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="bg2dlc-line-chart">
      <rect width={width} height={height} fill="#090812" />
      <defs><clipPath id={plotClipId}><rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} /></clipPath></defs>
      {[0, .25, .5, .75, 1].map((f) => <g key={f}><line x1={m.l} y1={py(yMin + f * (yMax - yMin))} x2={width - m.r} y2={py(yMin + f * (yMax - yMin))} stroke="rgba(183,174,222,.16)" /><text x={m.l - 7} y={py(yMin + f * (yMax - yMin)) + 4} fill="#c3bddc" textAnchor="end" fontSize="11">{(yMin + f * (yMax - yMin)).toPrecision(3)}</text></g>)}
      {[0, .25, .5, .75, 1].map((f) => <g key={f}><line x1={px(f * maxX)} y1={m.t} x2={px(f * maxX)} y2={height - m.b} stroke="rgba(183,174,222,.16)" /><text x={px(f * maxX)} y={height - 18} fill="#c3bddc" textAnchor="middle" fontSize="11">{(f * maxX).toPrecision(3)}</text></g>)}
      <g clipPath={`url(#${plotClipId})`}>
        {vertical.filter((x) => Number.isFinite(x) && x >= 0 && x <= maxX).map((x, i) => <line key={`v${i}`} x1={px(x)} y1={m.t} x2={px(x)} y2={height - m.b} stroke="#9b88ff" strokeDasharray="5 4" />)}
        {horizontal.filter((y) => Number.isFinite(y) && y >= yMin && y <= yMax).map((y, i) => <line key={`h${i}`} x1={m.l} y1={py(y)} x2={width - m.r} y2={py(y)} stroke="#38a8ff" strokeDasharray="5 4" />)}
        {series.map((item) => <polyline key={item.label} points={item.points.map((point) => `${px(point.x)},${py(point.y)}`).join(" ")} fill="none" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash ? "5 4" : undefined} />)}
      </g>
      <rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} fill="none" stroke="#716a91" />
      <text x={m.l + (width - m.l - m.r) / 2} y={height - 3} fill="#c3bddc" textAnchor="middle" fontSize="11">Time (min)</text>
      <text transform={`translate(13 ${m.t + (height - m.t - m.b) / 2}) rotate(-90)`} fill="#c3bddc" textAnchor="middle" fontSize="11">%B</text>
    </svg>
    <figcaption className="bg2dlc-plot-caption">
      <strong>Legend</strong>
      {visibleSeries.map((item) => <span className="bg2dlc-legend-item" key={item.label}><i className="bg2dlc-legend-line" style={{ borderTopColor: item.color, borderTopStyle: item.dash ? "dashed" : "solid" }} />{item.label}</span>)}
      {hasTimeBounds && <span className="bg2dlc-legend-item"><i className="bg2dlc-legend-line is-dashed" style={{ borderTopColor: "#9b88ff" }} />Time bounds</span>}
      {hasPhiBounds && <span className="bg2dlc-legend-item"><i className="bg2dlc-legend-line is-dashed" style={{ borderTopColor: "#38a8ff" }} />%B bounds</span>}
      <span className="bg2dlc-caption-text">{caption}</span>
    </figcaption>
  </figure>;
}
