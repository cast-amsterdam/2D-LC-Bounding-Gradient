export interface PlotPoint { x: number; y: number }

export function cellCenteredRasterRect(plotWidth: number, plotHeight: number, columns: number, rows: number) {
  const cellWidth = columns > 1 ? plotWidth / (columns - 1) : plotWidth;
  const cellHeight = rows > 1 ? plotHeight / (rows - 1) : plotHeight;
  return { x: -cellWidth / 2, y: -cellHeight / 2, width: plotWidth + cellWidth, height: plotHeight + cellHeight };
}

export function extendToEnd(points: PlotPoint[], endTime?: number): PlotPoint[] {
  if (!points.length || !Number.isFinite(endTime) || endTime! <= points.at(-1)!.x) return points;
  return [...points, { x: endTime!, y: points.at(-1)!.y }];
}

function interpolatePlotLine(points: PlotPoint[], x: number) {
  if (!points.length || x < points[0].x || x > points.at(-1)!.x) return Number.NaN;
  let low = 0, high = points.length - 1;
  while (low < high - 1) { const middle = (low + high) >> 1; if (points[middle].x <= x) low = middle; else high = middle; }
  if (points[low].x === x || low === high) return points[low].y;
  const span = points[high].x - points[low].x;
  return span > 0 ? points[low].y + ((x - points[low].x) / span) * (points[high].y - points[low].y) : points[low].y;
}

export function shiftingTrace(rows: number[][], retentionTimes: number[]): PlotPoint[] {
  if (retentionTimes.length < 2) return [];
  const start = rows.filter((row) => Number.isFinite(row[0]) && Number.isFinite(row[1])).map((row) => ({ x: row[0], y: row[1] }));
  const end = rows.filter((row) => Number.isFinite(row[2]) && Number.isFinite(row[3])).map((row) => ({ x: row[2], y: row[3] }));
  const modulationTime = retentionTimes[1] - retentionTimes[0];
  const points: PlotPoint[] = [];
  for (const time of retentionTimes) {
    const nextTime = time + modulationTime;
    const startPhi = interpolatePlotLine(start, time);
    const rawEndPhi = interpolatePlotLine(end, nextTime);
    const nextStartPhi = interpolatePlotLine(start, nextTime);
    if (![startPhi, rawEndPhi, nextStartPhi].every(Number.isFinite)) continue;
    // A solvent gradient must never descend within a modulation. The envelope
    // construction already orders the curves; this is a final guard for steep
    // editable boundaries between adjacent retention-time samples.
    const endPhi = Math.max(startPhi, rawEndPhi);
    points.push({ x: time, y: startPhi }, { x: nextTime, y: endPhi }, { x: nextTime, y: nextStartPhi });
  }
  return points;
}
