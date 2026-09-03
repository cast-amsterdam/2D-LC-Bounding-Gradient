import type { DisplayGrid, Point } from "../types";
import Delaunator from "delaunator";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function nearestIndex(values: readonly number[], target: number): number {
  let best = 0;
  let distance = Math.abs(values[0] - target);
  for (let i = 1; i < values.length; i += 1) {
    const current = Math.abs(values[i] - target);
    if (current < distance) {
      distance = current;
      best = i;
    }
  }
  return best;
}

export function interpLinear(points: readonly { time: number; phi: number }[], time: number): number {
  if (time <= points[0].time) return points[0].phi;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (time <= b.time) {
      const span = b.time - a.time;
      if (span === 0) return b.phi;
      return a.phi + ((time - a.time) / span) * (b.phi - a.phi);
    }
  }
  return points[points.length - 1].phi;
}

export function rescale(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  if (fromMax === fromMin) return (toMin + toMax) / 2;
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
}

export function otsu256(values: Float64Array): number {
  const histogram = new Float64Array(256);
  let count = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    histogram[clamp(Math.round(clamp(value, 0, 1) * 255), 0, 255)] += 1;
    count += 1;
  }
  if (!count) return 0;
  let totalMean = 0;
  for (let i = 0; i < 256; i += 1) totalMean += i * histogram[i];

  let backgroundWeight = 0;
  let backgroundMean = 0;
  let maxVariance = -1;
  const winners: number[] = [];
  for (let threshold = 0; threshold < 255; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (!backgroundWeight) continue;
    const foregroundWeight = count - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundMean += threshold * histogram[threshold];
    const mean0 = backgroundMean / backgroundWeight;
    const mean1 = (totalMean - backgroundMean) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (mean0 - mean1) ** 2;
    if (variance > maxVariance + Number.EPSILON) {
      maxVariance = variance;
      winners.length = 0;
      winners.push(threshold);
    } else if (Math.abs(variance - maxVariance) <= Number.EPSILON * Math.max(1, maxVariance)) {
      winners.push(threshold);
    }
  }
  const selected = winners.length ? winners.reduce((sum, v) => sum + v, 0) / winners.length : 0;
  return selected / 255;
}

const cross = (origin: Point, a: Point, b: Point) =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

export function convexHull(input: readonly Point[]): Point[] {
  const unique = [...new Map(input.map((point) => [`${point.x}:${point.y}`, point])).values()]
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (unique.length <= 1) return unique;
  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) < 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) < 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  if (hull.length) hull.push({ ...hull[0] });
  return hull;
}

export function pointInPolygon(x: number, y: number, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function closestPointOnPolyline(point: Point, polyline: readonly Point[]) {
  let best: { point: Point; segmentIndex: number; t: number; distance: number } | undefined;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const a = polyline[index], b = polyline[index + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0 ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1) : 0;
    const projected = { x: a.x + t * dx, y: a.y + t * dy };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (!best || distance < best.distance) best = { point: projected, segmentIndex: index, t, distance };
  }
  return best;
}

export function matlabCompatiblePolygonMask(
  xAxis: readonly number[],
  yAxis: readonly number[],
  polygon: readonly Point[],
): Uint8Array {
  const width = xAxis.length, height = yAxis.length;
  const xSpan = xAxis[width - 1] - xAxis[0], ySpan = yAxis[height - 1] - yAxis[0];
  // poly2mask/createMask snaps ROI vertices to a 5-by-5 subpixel grid before
  // classifying the central subpixel. Intrinsic image centers are 1-based.
  const snapped = polygon.map((point) => {
    const intrinsicX = 1 + (point.x - xAxis[0]) * (width - 1) / xSpan;
    const intrinsicY = 1 + (point.y - yAxis[0]) * (height - 1) / ySpan;
    return {
      x: Math.round((intrinsicX - .1) * 5) / 5 + .1,
      y: Math.round((intrinsicY - .1) * 5) / 5 + .1,
    };
  });
  const mask = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    // poly2mask classifies the center of the middle subpixel in its 5-by-5
    // raster. In intrinsic image coordinates that is 0.02 below the integer
    // pixel center (rows increase downward inside the mask raster).
    if (pointInPolygon(column + 1, row + 1.02, snapped)) mask[row * width + column] = 1;
  }
  return mask;
}

export function downsamplePeak(
  values: Float64Array,
  width: number,
  height: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  maxPixels = 1_000_000,
): DisplayGrid {
  const scale = Math.min(1, Math.sqrt(maxPixels / Math.max(1, width * height)));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const output = new Float32Array(targetWidth * targetHeight);
  output.fill(Number.NaN);
  let valueMin = Number.POSITIVE_INFINITY;
  let valueMax = Number.NEGATIVE_INFINITY;
  for (let ty = 0; ty < targetHeight; ty += 1) {
    const y0 = Math.floor((ty * height) / targetHeight);
    const y1 = Math.max(y0 + 1, Math.ceil(((ty + 1) * height) / targetHeight));
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const x0 = Math.floor((tx * width) / targetWidth);
      const x1 = Math.max(x0 + 1, Math.ceil(((tx + 1) * width) / targetWidth));
      let peak = Number.NEGATIVE_INFINITY;
      for (let y = y0; y < Math.min(height, y1); y += 1) {
        for (let x = x0; x < Math.min(width, x1); x += 1) {
          const value = values[y * width + x];
          if (Number.isFinite(value) && value > peak) peak = value;
        }
      }
      if (peak > Number.NEGATIVE_INFINITY) {
        output[ty * targetWidth + tx] = peak;
        valueMin = Math.min(valueMin, peak);
        valueMax = Math.max(valueMax, peak);
      }
    }
  }
  if (!Number.isFinite(valueMin)) valueMin = 0;
  if (!Number.isFinite(valueMax)) valueMax = 1;
  return { width: targetWidth, height: targetHeight, values: output, xMin, xMax, yMin, yMax, valueMin, valueMax };
}

export function robustDisplayRange(grid: DisplayGrid, lowerQuantile = 0.01, upperQuantile = 0.995): DisplayGrid {
  const finite = Array.from(grid.values).filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length < 2 || !(lowerQuantile >= 0 && lowerQuantile < upperQuantile && upperQuantile <= 1)) return grid;
  const quantile = (fraction: number) => {
    const position = fraction * (finite.length - 1);
    const lower = Math.floor(position), upper = Math.ceil(position);
    return finite[lower] + (finite[upper] - finite[lower]) * (position - lower);
  };
  const valueMin = quantile(lowerQuantile), valueMax = quantile(upperQuantile);
  return valueMax > valueMin ? { ...grid, valueMin, valueMax } : grid;
}

function cubicWeight(distance: number): number {
  const x = Math.abs(distance);
  const a = -0.5;
  if (x <= 1) return (a + 2) * x ** 3 - (a + 3) * x ** 2 + 1;
  if (x < 2) return a * x ** 3 - 5 * a * x ** 2 + 8 * a * x - 4 * a;
  return 0;
}

export function bicubicSample(values: Float64Array, width: number, height: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let weighted = 0;
  let total = 0;
  for (let row = iy - 1; row <= iy + 2; row += 1) {
    if (row < 0 || row >= height) continue;
    for (let column = ix - 1; column <= ix + 2; column += 1) {
      if (column < 0 || column >= width) continue;
      const value = values[row * width + column];
      if (!Number.isFinite(value)) continue;
      const weight = cubicWeight(x - column) * cubicWeight(y - row);
      weighted += value * weight;
      total += weight;
    }
  }
  return Math.abs(total) < 1e-12 ? Number.NaN : weighted / total;
}

export interface ScatteredPoint extends Point { value: number }
export interface ScatteredSamples {
  x: Float64Array;
  y: Float64Array;
  value: Float64Array;
}

export async function triangulatedCubicGrid(
  points: readonly ScatteredPoint[] | ScatteredSamples,
  xAxis: readonly number[],
  yAxis: readonly number[],
  progress?: (value: number) => void,
): Promise<Float64Array> {
  let sampleX: Float64Array, sampleY: Float64Array, sampleValue: Float64Array;
  const deduplicate = (length: number, read: (index: number) => ScatteredPoint) => {
    let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < length; index += 1) {
      const point = read(index);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.value)) continue;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
    const ulp = (value: number) => value === 0
      ? Number.MIN_VALUE
      : Number.EPSILON * 2 ** Math.floor(Math.log2(Math.abs(value)));
    const toleranceX = Math.cbrt(ulp(.5 * (maxX - minX)));
    const toleranceY = Math.cbrt(ulp(.5 * (maxY - minY)));
    type Site = { x: number; y: number; sumX: number; sumY: number; sum: number; count: number };
    const sites: Site[] = [];
    const bins = new Map<string, number[]>();
    for (let index = 0; index < length; index += 1) {
      const point = read(index);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.value)) continue;
      const binX = Math.floor(point.x / toleranceX), binY = Math.floor(point.y / toleranceY);
      let match = -1;
      for (let offsetY = -1; offsetY <= 1 && match < 0; offsetY += 1) for (let offsetX = -1; offsetX <= 1 && match < 0; offsetX += 1) {
        const candidates = bins.get(`${binX + offsetX}:${binY + offsetY}`);
        if (!candidates) continue;
        for (const candidate of candidates) {
          const site = sites[candidate];
          if (Math.abs(point.x - site.x) <= toleranceX && Math.abs(point.y - site.y) <= toleranceY) { match = candidate; break; }
        }
      }
      if (match >= 0) {
        const site = sites[match];
        site.sumX += point.x; site.sumY += point.y; site.sum += point.value; site.count += 1;
        site.x = site.sumX / site.count; site.y = site.sumY / site.count;
      } else {
        match = sites.length;
        sites.push({ x: point.x, y: point.y, sumX: point.x, sumY: point.y, sum: point.value, count: 1 });
        const key = `${binX}:${binY}`;
        const bucket = bins.get(key);
        if (bucket) bucket.push(match); else bins.set(key, [match]);
      }
    }
    return sites.sort((left, right) => left.y - right.y || left.x - right.x);
  };
  if ("x" in points) {
    const samples = deduplicate(points.x.length, (index) => ({ x: points.x[index], y: points.y[index], value: points.value[index] }));
    sampleX = new Float64Array(samples.length);
    sampleY = new Float64Array(samples.length);
    sampleValue = new Float64Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      sampleX[index] = samples[index].x; sampleY[index] = samples[index].y; sampleValue[index] = samples[index].sum / samples[index].count;
    }
  } else {
    const samples = deduplicate(points.length, (index) => points[index]);
    sampleX = Float64Array.from(samples, (point) => point.x);
    sampleY = Float64Array.from(samples, (point) => point.y);
    sampleValue = Float64Array.from(samples, (point) => point.sum / point.count);
  }
  const sampleCount = sampleX.length;
  if (sampleCount < 3) throw new Error("The ROI contains too few distinct points for interpolation.");
  const coords = new Float64Array(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) { coords[index * 2] = sampleX[index]; coords[index * 2 + 1] = sampleY[index]; }
  const rawTriangles = new Delaunator(coords).triangles;
  const triangles = new Uint32Array(rawTriangles.length);
  const triangleAreas = new Float64Array(rawTriangles.length / 3);
  const gradientXSum = new Float64Array(sampleCount);
  const gradientYSum = new Float64Array(sampleCount);
  const gradientAreaSum = new Float64Array(sampleCount);

  // MATLAB griddata's cubic branch estimates each vertex gradient from the
  // area-weighted slopes of its adjacent Delaunay triangles. Keep every
  // triangle counter-clockwise so its signed area has MATLAB's convention.
  for (let offset = 0; offset < rawTriangles.length; offset += 3) {
    let ia = rawTriangles[offset], ib = rawTriangles[offset + 1], ic = rawTriangles[offset + 2];
    let determinant = (sampleX[ib] - sampleX[ia]) * (sampleY[ic] - sampleY[ia]) - (sampleX[ic] - sampleX[ia]) * (sampleY[ib] - sampleY[ia]);
    if (determinant < 0) {
      [ib, ic] = [ic, ib];
      determinant = -determinant;
    }
    triangles[offset] = ia; triangles[offset + 1] = ib; triangles[offset + 2] = ic;
    const area = determinant / 2;
    triangleAreas[offset / 3] = area;
    if (area <= 1e-20) continue;
    const dzdx = ((sampleValue[ib] - sampleValue[ia]) * (sampleY[ic] - sampleY[ia]) - (sampleValue[ic] - sampleValue[ia]) * (sampleY[ib] - sampleY[ia])) / determinant;
    const dzdy = ((sampleX[ib] - sampleX[ia]) * (sampleValue[ic] - sampleValue[ia]) - (sampleX[ic] - sampleX[ia]) * (sampleValue[ib] - sampleValue[ia])) / determinant;
    for (const vertex of [ia, ib, ic]) {
      gradientXSum[vertex] += dzdx * area;
      gradientYSum[vertex] += dzdy * area;
      gradientAreaSum[vertex] += area;
    }
  }
  const gradientX = new Float64Array(sampleCount);
  const gradientY = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    if (gradientAreaSum[index] === 0) continue;
    gradientX[index] = gradientXSum[index] / gradientAreaSum[index];
    gradientY[index] = gradientYSum[index] / gradientAreaSum[index];
  }

  const output = new Float64Array(xAxis.length * yAxis.length);
  output.fill(Number.NaN);
  const ascendingIndexRange = (axis: readonly number[], min: number, max: number) => {
    let low = 0, high = axis.length;
    while (low < high) { const middle = (low + high) >>> 1; if (axis[middle] < min) low = middle + 1; else high = middle; }
    const start = low;
    low = 0; high = axis.length;
    while (low < high) { const middle = (low + high) >>> 1; if (axis[middle] <= max) low = middle + 1; else high = middle; }
    const end = low - 1;
    return [start, end] as const;
  };

  const cyclicNext = [1, 2, 0] as const;
  const cyclicPrevious = [2, 0, 1] as const;
  for (let tri = 0; tri < triangles.length; tri += 3) {
    const ia = triangles[tri], ib = triangles[tri + 1], ic = triangles[tri + 2];
    const x = [sampleX[ia], sampleX[ib], sampleX[ic]];
    const y = [sampleY[ia], sampleY[ib], sampleY[ic]];
    const z = [sampleValue[ia], sampleValue[ib], sampleValue[ic]];
    const denominator = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2]);
    if (Math.abs(denominator) < 1e-18) continue;
    const queryXRange = ascendingIndexRange(xAxis, Math.min(...x), Math.max(...x));
    const queryYRange = ascendingIndexRange(yAxis, Math.min(...y), Math.max(...y));
    if (queryXRange[0] > queryXRange[1] || queryYRange[0] > queryYRange[1]) continue;
    const vertexIndices = [ia, ib, ic] as const;
    const gx = vertexIndices.map((index) => gradientX[index]);
    const gy = vertexIndices.map((index) => gradientY[index]);
    const area = triangleAreas[tri / 3];
    const length = [0, 1, 2].map((index) => {
      const p = cyclicNext[index as 0 | 1 | 2], q = cyclicPrevious[index as 0 | 1 | 2];
      return Math.hypot(x[q] - x[p], y[q] - y[p]);
    });
    const normalSlope = [0, 1, 2].map((index) => {
      const p = cyclicNext[index as 0 | 1 | 2], q = cyclicPrevious[index as 0 | 1 | 2];
      return ((gx[p] + gx[q]) * (y[p] - y[q]) - (gy[p] + gy[q]) * (x[p] - x[q])) / (2 * length[index]);
    });

    // Edge-normal terms from MATLAB's triangle cubic finite-element basis
    // (the Yang/Watson formulation used by griddata(..., "cubic")).
    const wna = [0, 1, 2].map((index) => {
      const p = cyclicNext[index as 0 | 1 | 2], q = cyclicPrevious[index as 0 | 1 | 2];
      const edge2 = (y[p] - y[q]) ** 2 + (x[p] - x[q]) ** 2;
      let value = .25 * edge2 * z[index];
      value -= .0625 * edge2 * (-x[p] + 2 * x[index] - x[q]) * gx[index];
      value -= .0625 * edge2 * (-y[p] + 2 * y[index] - y[q]) * gy[index];
      return value / (area * length[index]);
    });
    const wnb = [0, 1, 2].map((index) => {
      const p = cyclicNext[index as 0 | 1 | 2], q = cyclicPrevious[index as 0 | 1 | 2];
      let value = .25 * (
        y[index] ** 2 + y[index] * y[q] - 3 * y[p] * y[index] + 3 * y[p] * y[q] - 2 * y[q] ** 2 +
        x[index] ** 2 + x[index] * x[q] - 3 * x[p] * x[index] + 3 * x[p] * x[q] - 2 * x[q] ** 2
      ) * z[index];
      value -= .0625 * (
        6 * y[index] * x[p] * y[q] - 3 * y[index] ** 2 * x[p] - 2 * y[index] * x[index] * y[q] + 2 * y[index] ** 2 * x[index] -
        4 * y[index] * x[q] * y[q] + y[index] ** 2 * x[q] - 2 * y[p] * x[q] * y[q] + 2 * y[p] * x[q] * y[index] +
        2 * y[p] * x[index] * y[q] - 2 * y[p] * x[index] * y[index] + 3 * y[q] ** 2 * x[q] - 3 * y[q] ** 2 * x[p] -
        x[index] ** 2 * x[q] + 2 * x[index] ** 3 + 10 * x[p] * x[index] * x[q] - 5 * x[p] * x[index] ** 2 -
        4 * x[index] * x[q] ** 2 - 5 * x[q] ** 2 * x[p] + 3 * x[q] ** 3
      ) * gx[index];
      value -= .0625 * (
        -(y[index] ** 2) * y[q] + 2 * y[index] ** 3 + 10 * y[p] * y[index] * y[q] - 5 * y[p] * y[index] ** 2 -
        4 * y[index] * y[q] ** 2 - 5 * y[q] ** 2 * y[p] + 3 * y[q] ** 3 + 6 * y[p] * x[index] * x[q] -
        3 * y[p] * x[index] ** 2 - 2 * y[index] * x[index] * x[q] + 2 * y[index] * x[index] ** 2 -
        4 * y[q] * x[index] * x[q] + y[q] * x[index] ** 2 - 2 * y[q] * x[p] * x[q] + 2 * y[q] * x[p] * x[index] +
        2 * y[index] * x[p] * x[q] - 2 * y[index] * x[p] * x[index] + 3 * x[q] ** 2 * y[q] - 3 * y[p] * x[q] ** 2
      ) * gy[index];
      return value / (area * length[p]);
    });
    const wnc = [0, 1, 2].map((index) => {
      const p = cyclicNext[index as 0 | 1 | 2], q = cyclicPrevious[index as 0 | 1 | 2];
      let value = .25 * (
        y[p] * y[index] + y[index] ** 2 - 2 * y[p] ** 2 + 3 * y[p] * y[q] - 3 * y[index] * y[q] +
        x[p] * x[index] + x[index] ** 2 - 2 * x[p] ** 2 + 3 * x[p] * x[q] - 3 * x[index] * x[q]
      ) * z[index];
      value -= .0625 * (
        y[index] ** 2 * x[p] - 4 * y[index] * x[p] * y[p] + 2 * y[index] ** 2 * x[index] -
        2 * y[p] * x[index] * y[index] - 3 * y[index] ** 2 * x[q] + 6 * y[p] * x[q] * y[index] -
        3 * y[p] ** 2 * x[q] + 3 * y[p] ** 2 * x[p] + 2 * y[index] * x[p] * y[q] -
        2 * y[p] * x[p] * y[q] - 2 * y[index] * x[index] * y[q] + 2 * y[p] * x[index] * y[q] +
        2 * x[index] ** 3 - x[p] * x[index] ** 2 - 4 * x[p] ** 2 * x[index] - 5 * x[index] ** 2 * x[q] +
        10 * x[p] * x[index] * x[q] + 3 * x[p] ** 3 - 5 * x[p] ** 2 * x[q]
      ) * gx[index];
      value -= .0625 * (
        2 * y[index] ** 3 - y[p] * y[index] ** 2 - 4 * y[p] ** 2 * y[index] - 5 * y[index] ** 2 * y[q] +
        10 * y[p] * y[index] * y[q] + 3 * y[p] ** 3 - 5 * y[p] ** 2 * y[q] + y[p] * x[index] ** 2 -
        4 * y[p] * x[index] * x[p] + 2 * y[index] * x[index] ** 2 - 2 * y[index] * x[p] * x[index] -
        3 * y[q] * x[index] ** 2 + 6 * y[q] * x[p] * x[index] - 3 * y[q] * x[p] ** 2 +
        3 * y[p] * x[p] ** 2 + 2 * y[p] * x[index] * x[q] - 2 * y[p] * x[p] * x[q] -
        2 * y[index] * x[index] * x[q] + 2 * y[index] * x[p] * x[q]
      ) * gy[index];
      return value / (area * length[q]);
    });
    const edgeNormal = [0, 1, 2].map((index) => wna[index] + wnb[cyclicPrevious[index as 0 | 1 | 2]] + wnc[cyclicNext[index as 0 | 1 | 2]]);
    const [x0, x1] = queryXRange;
    const [y0, y1] = queryYRange;
    for (let yi = y0; yi <= y1; yi += 1) {
      const queryY = yAxis[yi];
      for (let xi = x0; xi <= x1; xi += 1) {
        const queryX = xAxis[xi];
        const l1 = ((y[1] - y[2]) * (queryX - x[2]) + (x[2] - x[1]) * (queryY - y[2])) / denominator;
        const l2 = ((y[2] - y[0]) * (queryX - x[2]) + (x[0] - x[2]) * (queryY - y[2])) / denominator;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const weights = [l1, l2, l3];
        const triple = l1 * l2 * l3;
        let value = 0;
        for (let index = 0; index < 3; index += 1) {
          const p = cyclicNext[index as 0 | 1 | 2], q = cyclicPrevious[index as 0 | 1 | 2];
          const wi = weights[index];
          const n1 = wi + wi ** 2 * weights[p] + wi ** 2 * weights[q] - wi * weights[p] ** 2 - wi * weights[q] ** 2;
          const common = .5 * triple;
          const n2 = (x[p] - x[index]) * (wi ** 2 * weights[p] + common) +
            (x[q] - x[index]) * (wi ** 2 * weights[q] + common);
          const n3 = (y[p] - y[index]) * (wi ** 2 * weights[p] + common) +
            (y[q] - y[index]) * (wi ** 2 * weights[q] + common);
          const denominatorA = wi + weights[p], denominatorB = wi + weights[q];
          const m = Math.abs(denominatorA * denominatorB) < 1e-20 ? 0 :
            8 * area / length[index] * wi * weights[p] ** 2 * weights[q] ** 2 / denominatorA / denominatorB;
          value += n1 * z[index] + n2 * gx[index] + n3 * gy[index] + m * (normalSlope[index] - edgeNormal[index]);
        }
        output[yi * xAxis.length + xi] = value;
      }
    }
    if (tri % 300 === 0) {
      progress?.(tri / Math.max(1, triangles.length));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  progress?.(1);
  return output;
}
