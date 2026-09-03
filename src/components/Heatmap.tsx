import { useEffect, useRef, useState } from "react";
import type { DisplayGrid, Method, Point } from "../types";
import { clamp, closestPointOnPolyline, pointInPolygon } from "../core/numerics";
import { cellCenteredRasterRect } from "../core/plot";
import { copyPlotPng, type PngLegendItem } from "../core/plotPng";

interface Props {
  title: string;
  grid?: DisplayGrid;
  roi?: Point[];
  method?: Method;
  editable?: boolean;
  emptyMessage?: string;
  onRoiChange?: (roi: Point[], commit: boolean) => void;
}

function color(value: number, min: number, max: number): [number, number, number, number] {
  if (!Number.isFinite(value)) return [9, 8, 18, 255];
  const t = clamp((value - min) / Math.max(1e-12, max - min), 0, 1);
  const channel = (centre: number) => clamp(1.5 - Math.abs(4 * t - centre), 0, 1);
  return [Math.round(255 * channel(3)), Math.round(255 * channel(2)), Math.round(255 * channel(1)), 255];
}

export function Heatmap({ title, grid, roi, method = "FiF", editable = false, emptyMessage = "Load an XLSX chromatogram to begin", onRoiChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [localRoi, setLocalRoi] = useState<Point[]>(roi ?? []);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "blocked">("idle");
  const roiRef = useRef<Point[]>(roi ?? []);
  const drag = useRef<{ mode: "vertex" | "move"; index: number; start: Point; original: Point[] } | undefined>(undefined);

  useEffect(() => { setLocalRoi(roi ?? []); roiRef.current = roi ?? []; }, [roi]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.scale(dpr, dpr); ctx.fillStyle = "#090812"; ctx.fillRect(0, 0, width, height);
      const margin = { left: 50, right: 16, top: 14, bottom: 38 };
      const plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
      if (grid) {
        const offscreen = document.createElement("canvas"); offscreen.width = grid.width; offscreen.height = grid.height;
        const off = offscreen.getContext("2d");
        if (off) {
          const image = off.createImageData(grid.width, grid.height);
          for (let row = 0; row < grid.height; row += 1) {
            for (let column = 0; column < grid.width; column += 1) {
              const rgba = color(grid.values[row * grid.width + column], grid.valueMin, grid.valueMax);
              const target = ((grid.height - row - 1) * grid.width + column) * 4;
              image.data.set(rgba, target);
            }
          }
          off.putImageData(image, 0, 0); ctx.imageSmoothingEnabled = true;
          const raster = cellCenteredRasterRect(plotWidth, plotHeight, grid.width, grid.height);
          ctx.save(); ctx.beginPath(); ctx.rect(margin.left, margin.top, plotWidth, plotHeight); ctx.clip();
          ctx.drawImage(offscreen, margin.left + raster.x, margin.top + raster.y, raster.width, raster.height); ctx.restore();
        }
      } else {
        ctx.fillStyle = "#0d0c18"; ctx.fillRect(margin.left, margin.top, plotWidth, plotHeight);
        ctx.fillStyle = "#817b9d"; ctx.font = "13px system-ui"; ctx.textAlign = "center";
        ctx.fillText(emptyMessage, margin.left + plotWidth / 2, margin.top + plotHeight / 2);
      }
      const xMin = grid?.xMin ?? 0, xMax = grid?.xMax ?? 1, yMin = grid?.yMin ?? 0, yMax = grid?.yMax ?? 1;
      const px = (x: number) => margin.left + ((x - xMin) / Math.max(1e-12, xMax - xMin)) * plotWidth;
      const py = (y: number) => margin.top + (1 - (y - yMin) / Math.max(1e-12, yMax - yMin)) * plotHeight;
      ctx.strokeStyle = "#716a91"; ctx.lineWidth = 1; ctx.strokeRect(margin.left, margin.top, plotWidth, plotHeight);
      ctx.fillStyle = "#c3bddc"; ctx.font = "11px system-ui";
      for (let i = 0; i <= 4; i += 1) {
        const f = i / 4, x = margin.left + f * plotWidth, y = margin.top + (1 - f) * plotHeight;
        ctx.strokeStyle = "rgba(183,174,222,.16)"; ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + plotHeight); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + plotWidth, y); ctx.stroke();
        ctx.fillStyle = "#c3bddc"; ctx.textAlign = "center"; ctx.fillText((xMin + f * (xMax - xMin)).toPrecision(3), x, height - 18);
        ctx.textAlign = "right"; ctx.fillText((yMin + f * (yMax - yMin)).toPrecision(3), margin.left - 7, y + 4);
      }
      ctx.textAlign = "center"; ctx.fillText("1D time (min)", margin.left + plotWidth / 2, height - 3);
      ctx.save(); ctx.translate(12, margin.top + plotHeight / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("2D time (min)", 0, 0); ctx.restore();
      if (localRoi.length > 1) {
        ctx.strokeStyle = "#ff4f72"; ctx.fillStyle = "rgba(255,79,114,.1)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px(localRoi[0].x), py(localRoi[0].y));
        for (const point of localRoi.slice(1)) ctx.lineTo(px(point.x), py(point.y));
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (editable) for (const point of localRoi.slice(0, -1)) {
          ctx.beginPath(); ctx.arc(px(point.x), py(point.y), 4.5, 0, Math.PI * 2); ctx.fillStyle = "#f7f5ff"; ctx.fill(); ctx.strokeStyle = "#ff4f72"; ctx.stroke();
        }
      }
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(wrap); return () => observer.disconnect();
  }, [grid, localRoi, editable, emptyMessage]);

  const eventPoint = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    const margin = { left: 50, right: 16, top: 14, bottom: 38 };
    const width = rect.width - margin.left - margin.right, height = rect.height - margin.top - margin.bottom;
    const xMin = grid?.xMin ?? 0, xMax = grid?.xMax ?? 1, yMin = grid?.yMin ?? 0, yMax = grid?.yMax ?? 1;
    return {
      x: clamp(xMin + ((event.clientX - rect.left - margin.left) / width) * (xMax - xMin), xMin, xMax),
      y: clamp(yMax - ((event.clientY - rect.top - margin.top) / height) * (yMax - yMin), yMin, yMax),
    };
  };
  const distancePx = (a: Point, b: Point) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return Math.hypot((a.x - b.x) / Math.max(1e-12, (grid?.xMax ?? 1) - (grid?.xMin ?? 0)) * rect.width, (a.y - b.y) / Math.max(1e-12, (grid?.yMax ?? 1) - (grid?.yMin ?? 0)) * rect.height);
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editable || !grid || localRoi.length < 2) return;
    const point = eventPoint(event); const open = localRoi.slice(0, -1);
    let index = -1, best = 13;
    open.forEach((candidate, i) => { const d = distancePx(candidate, point); if (d < best) { best = d; index = i; } });
    const mode = index >= 0 ? "vertex" : pointInPolygon(point.x, point.y, localRoi) ? "move" : undefined;
    if (!mode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, index, start: point, original: localRoi.map((p) => ({ ...p })) };
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !grid) return;
    const point = eventPoint(event); const state = drag.current; let next: Point[];
    if (state.mode === "move") {
      const dx = point.x - state.start.x, dy = point.y - state.start.y;
      const minX = Math.min(...state.original.map((p) => p.x)), maxX = Math.max(...state.original.map((p) => p.x));
      const minY = Math.min(...state.original.map((p) => p.y)), maxY = Math.max(...state.original.map((p) => p.y));
      const safeDx = clamp(dx, grid.xMin - minX, grid.xMax - maxX), safeDy = clamp(dy, grid.yMin - minY, grid.yMax - maxY);
      next = state.original.map((p) => ({ x: p.x + safeDx, y: p.y + safeDy }));
    } else if (method === "FiF") {
      const open = state.original.slice(0, -1); const target = open[state.index];
      let minX = Math.min(...open.map((p) => p.x)), maxX = Math.max(...open.map((p) => p.x));
      let minY = Math.min(...open.map((p) => p.y)), maxY = Math.max(...open.map((p) => p.y));
      if (Math.abs(target.x - minX) < Math.abs(target.x - maxX)) minX = Math.min(point.x, maxX); else maxX = Math.max(point.x, minX);
      if (Math.abs(target.y - minY) < Math.abs(target.y - maxY)) minY = Math.min(point.y, maxY); else maxY = Math.max(point.y, minY);
      next = [{ x: minX, y: maxY }, { x: maxX, y: maxY }, { x: maxX, y: minY }, { x: minX, y: minY }, { x: minX, y: maxY }];
    } else {
      next = state.original.map((p) => ({ ...p })); next[state.index] = point;
      if (state.index === 0) next[next.length - 1] = { ...point };
    }
    roiRef.current = next; setLocalRoi(next); onRoiChange?.(next, false);
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return; drag.current = undefined; event.currentTarget.releasePointerCapture(event.pointerId); onRoiChange?.(roiRef.current, true);
  };
  const doubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editable || method !== "Shifting gradient" || !grid || localRoi.length < 3) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const margin = { left: 50, right: 16, top: 14, bottom: 38 };
    const plotWidth = rect.width - margin.left - margin.right, plotHeight = rect.height - margin.top - margin.bottom;
    const screenRoi = localRoi.map((point) => ({
      x: margin.left + ((point.x - grid.xMin) / Math.max(1e-12, grid.xMax - grid.xMin)) * plotWidth,
      y: margin.top + (1 - (point.y - grid.yMin) / Math.max(1e-12, grid.yMax - grid.yMin)) * plotHeight,
    }));
    const hit = closestPointOnPolyline({ x: event.clientX - rect.left, y: event.clientY - rect.top }, screenRoi);
    if (!hit || hit.distance > 12) return;
    const screenA = screenRoi[hit.segmentIndex], screenB = screenRoi[hit.segmentIndex + 1];
    if (Math.min(Math.hypot(hit.point.x - screenA.x, hit.point.y - screenA.y), Math.hypot(hit.point.x - screenB.x, hit.point.y - screenB.y)) < 10) return;
    const a = localRoi[hit.segmentIndex], b = localRoi[hit.segmentIndex + 1];
    const inserted = { x: a.x + hit.t * (b.x - a.x), y: a.y + hit.t * (b.y - a.y) };
    const next = [...localRoi.slice(0, hit.segmentIndex + 1), inserted, ...localRoi.slice(hit.segmentIndex + 1)];
    event.preventDefault(); drag.current = undefined; roiRef.current = next; setLocalRoi(next); onRoiChange?.(next, true);
  };

  const legend: PngLegendItem[] = [
    { label: "Signal intensity  low → high", gradient: ["#000080", "#0000ff", "#00ffff", "#ffff00", "#ff0000", "#800000"] },
    ...(localRoi.length > 1 ? [{ label: "Selected ROI", color: "#ff4f72" }] : []),
  ];
  const caption = title === "ROI selection"
    ? "Corrected chromatogram with the selected useful separation region."
    : title.startsWith("Raw")
      ? "Measured two-dimensional chromatogram before gradient remapping."
      : method === "Shifting gradient"
        ? "Predicted two-dimensional chromatogram after gradient remapping. JET colors use robust 1st–99.5th percentile contrast; exported values remain unchanged."
        : "Predicted two-dimensional chromatogram after applying the optimized gradient program.";
  const copyPng = () => {
    const canvas = canvasRef.current;
    if (canvas) void copyPlotPng({ title, source: canvas, legend, caption })
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("blocked"))
      .finally(() => window.setTimeout(() => setCopyState("idle"), 1800));
  };

  return <figure className="bg2dlc-chart-card">
    <div className="bg2dlc-chart-heading"><h3>{title}</h3><button type="button" className="bg2dlc-icon-button" aria-label={`Copy ${title} as PNG`} onClick={copyPng} disabled={!grid}>{copyState === "copied" ? "Copied" : copyState === "blocked" ? "Copy blocked" : "Copy PNG"}</button></div>
    <div className={`bg2dlc-heatmap ${editable ? "is-editable" : ""}`} ref={wrapRef}>
      <canvas ref={canvasRef} aria-label={title} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onDoubleClick={doubleClick} />
    </div>
    <figcaption className="bg2dlc-plot-caption">
      <strong>Legend</strong>
      <span className="bg2dlc-legend-item"><i className="bg2dlc-intensity-scale" />Signal intensity <small>low → high</small></span>
      {localRoi.length > 1 && <span className="bg2dlc-legend-item"><i className="bg2dlc-legend-line" style={{ borderTopColor: "#ff4f72" }} />Selected ROI{editable && method === "Shifting gradient" && <small>double-click edge to add node</small>}</span>}
      <span className="bg2dlc-caption-text">{caption}</span>
    </figcaption>
  </figure>;
}
