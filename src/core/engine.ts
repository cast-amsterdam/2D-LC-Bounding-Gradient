import type { AnalysisRequest, AnalysisResult, DatasetMeta, GradientPoint, Point } from "../types";
import {
  bicubicSample,
  convexHull,
  downsamplePeak,
  interpLinear,
  matlabCompatiblePolygonMask,
  nearestIndex,
  otsu256,
  rescale,
  robustDisplayRange,
  triangulatedCubicGrid,
  type ScatteredSamples,
} from "./numerics";
import { validateAnalysis, validateStrictlyIncreasing } from "./validation";

export interface Dataset {
  fileName: string;
  sheetName: string;
  rt1: number[];
  rt2: number[];
  values: Float64Array;
  width: number;
  height: number;
}

type Progress = (stage: string, value: number) => void;

const closePolygon = (polygon: Point[]) => {
  if (!polygon.length) return polygon;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  return first.x === last.x && first.y === last.y ? polygon : [...polygon, { ...first }];
};

const uniqueSorted = (values: number[]) => [...new Set(values.map((value) => +value.toPrecision(14)))].sort((a, b) => a - b);

function transformChromatogram(dataset: Dataset, request: AnalysisRequest) {
  const { width, height, values, rt1, rt2 } = dataset;
  const t01 = request.params.dead1D / request.params.flow1D;
  const t02 = request.params.dead2D / request.params.flow2D;
  const flip = nearestIndex(rt2, t02);
  const corrected = new Float64Array(values.length);

  for (let targetRow = 0; targetRow < height; targetRow += 1) {
    const sourceRow = targetRow < height - flip - 1 ? targetRow + flip + 1 : targetRow - (height - flip - 1);
    const wraps = sourceRow <= flip;
    for (let column = 0; column < width; column += 1) {
      corrected[targetRow * width + column] = wraps
        ? (column < width - 1 ? values[sourceRow * width + column + 1] : 0)
        : values[sourceRow * width + column];
    }
  }

  const cut = nearestIndex(rt1, t01);
  const detection = new Float64Array(values.length);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      detection[row * width + column] = column < width - cut
        ? corrected[row * width + column + cut]
        : 0;
    }
  }
  const lowerTime = rt2[rt2.length - 1] - t02;
  for (let row = 0; row < height; row += 1) {
    if (rt2[row] < lowerTime) detection.fill(0, row * width, (row + 1) * width);
  }
  return { corrected, detection, t01, t02 };
}

function detectRoi(dataset: Dataset, request: AnalysisRequest, detection: Float64Array) {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of detection) if (Number.isFinite(value)) maximum = Math.max(maximum, value);
  if (!Number.isFinite(maximum) || maximum <= 0) throw new Error("No positive signal remains after dead-time correction.");
  const normalized = new Float64Array(detection.length);
  for (let i = 0; i < detection.length; i += 1) normalized[i] = Math.pow(Math.max(0, detection[i] / maximum), 1.5);
  const threshold = otsu256(normalized);

  const minRows = new Int32Array(dataset.width); minRows.fill(-1);
  const maxRows = new Int32Array(dataset.width); maxRows.fill(-1);
  const minColumns = new Int32Array(dataset.height); minColumns.fill(-1);
  const maxColumns = new Int32Array(dataset.height); maxColumns.fill(-1);
  let minRow = dataset.height, maxRow = -1, minColumn = dataset.width, maxColumn = -1, detectedPixels = 0;
  for (let row = 0; row < dataset.height; row += 1) {
    for (let column = 0; column < dataset.width; column += 1) {
      if (normalized[row * dataset.width + column] <= threshold) continue;
      detectedPixels += 1;
      minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
      minColumn = Math.min(minColumn, column); maxColumn = Math.max(maxColumn, column);
      if (minRows[column] < 0) minRows[column] = row;
      maxRows[column] = row;
      if (minColumns[row] < 0) minColumns[row] = column;
      maxColumns[row] = column;
    }
  }
  if (!detectedPixels) throw new Error("No signal pixels were detected at the automatic threshold.");

  const pixelHullPoints: Point[] = [];
  for (let column = 0; column < dataset.width; column += 1) {
    if (minRows[column] < 0) continue;
    pixelHullPoints.push({ x: column, y: minRows[column] });
    if (maxRows[column] !== minRows[column]) pixelHullPoints.push({ x: column, y: maxRows[column] });
  }
  for (let row = 0; row < dataset.height; row += 1) {
    if (minColumns[row] < 0) continue;
    pixelHullPoints.push({ x: minColumns[row], y: row });
    if (maxColumns[row] !== minColumns[row]) pixelHullPoints.push({ x: maxColumns[row], y: row });
  }
  const hull = convexHull(pixelHullPoints);
  const td1 = request.params.dwell1D / request.params.flow1D;
  const autoRoi = request.method === "FiF"
    ? closePolygon([
        { x: dataset.rt1[minColumn] + td1, y: dataset.rt2[maxRow] },
        { x: dataset.rt1[maxColumn] + td1, y: dataset.rt2[maxRow] },
        { x: dataset.rt1[maxColumn] + td1, y: dataset.rt2[minRow] },
        { x: dataset.rt1[minColumn] + td1, y: dataset.rt2[minRow] },
      ])
    : closePolygon(hull.map((point) => ({ x: dataset.rt1[point.x] + td1, y: dataset.rt2[point.y] })));
  return { threshold, detectedPixels, autoRoi };
}

function gradientWithEnd(points: GradientPoint[], endTime: number): GradientPoint[] {
  const output = points.map((point) => ({ ...point }));
  if (output[output.length - 1].time < endTime) output.push({ time: endTime, phi: output[output.length - 1].phi });
  return output;
}

function phi1(request: AnalysisRequest, maxTime: number, time: number) {
  const td = request.params.dwell1D / request.params.flow1D;
  const t0 = request.params.dead1D / request.params.flow1D;
  const sampleTime = time - td - t0;
  return sampleTime > 0 ? interpLinear(gradientWithEnd(request.gradient1D, maxTime), sampleTime) : request.gradient1D[0].phi;
}

function phi2(request: AnalysisRequest, maxTime: number, time: number) {
  const td = request.params.dwell2D / request.params.flow2D;
  const sampleTime = time - td;
  return sampleTime > 0 ? interpLinear(gradientWithEnd(request.gradient2D, maxTime), sampleTime) : request.gradient2D[0].phi;
}

export function optimizeGradient(
  points: GradientPoint[],
  optimum: number[],
  maxTime: number,
  phiAt: (time: number) => number,
  offset: number,
) {
  const opt = uniqueSorted(optimum.map((value) => Math.max(0, value)));
  const extended = gradientWithEnd(points, maxTime);
  let times = uniqueSorted([...extended.filter((point) => point.time < Math.max(...opt)).map((point) => point.time), ...opt]);
  while (times.length > 2 && points.length > 1 && times.slice(1).some((time) => time < points[1].time)) times.splice(1, 1);
  let phis = times.map((time) => phiAt(time + offset));
  const max = Math.max(...times);
  if (max > 0 && times.length >= 3) {
    if (points.length > 3) {
      // Multi-step scan programs are a web-app extension. If the useful ROI
      // starts partway through the scan gradient, begin just after the initial
      // hold at the composition on the ROI's left edge. Otherwise retain all
      // intermediate breakpoints later in the program. The fixed three-row
      // MATLAB behavior below remains untouched.
      const holdEnd = points[1].time;
      const sourceEnd = Math.max(...opt);
      const sourceStart = Math.min(sourceEnd, Math.max(holdEnd, Math.min(...opt)));
      const holdPhi = phiAt(holdEnd + offset);
      const startPhi = phiAt(sourceStart + offset);
      const needsStartingStep = sourceStart > holdEnd && Math.abs(startPhi - holdPhi) > 1e-10;
      const targetStart = needsStartingStep ? Math.min(maxTime, holdEnd + 0.01) : holdEnd;
      const sourceTimes = uniqueSorted([
        points[0].time,
        holdEnd,
        ...(needsStartingStep ? [sourceStart] : []),
        ...extended.filter((point) => point.time > sourceStart && point.time < sourceEnd).map((point) => point.time),
        sourceEnd,
      ]);
      phis = sourceTimes.map((time) => phiAt(time + offset));
      times = sourceTimes.map((time) => {
        if (time <= holdEnd) return time;
        if (sourceEnd <= sourceStart) return targetStart;
        return targetStart + ((time - sourceStart) / (sourceEnd - sourceStart)) * (maxTime - targetStart);
      });
      if (needsStartingStep) {
        const startIndex = sourceTimes.indexOf(sourceStart);
        if (startIndex >= 0) times[startIndex] = targetStart;
      }
    } else if (times.length === 4 && phis[2] === phis[3] && phis[0] === phis[1]) {
      for (let i = 2; i < times.length; i += 1) times[i] = (times[i] / max) * maxTime;
    } else if (times.length > 3 && (phis[phis.length - 2] < phis[phis.length - 1] || phis[2] > phis[1])) {
      const pivot = times[2];
      for (let i = 3; i < times.length; i += 1) times[i] = ((times[i] - pivot) / max) * maxTime;
      times[2] = times[1] + 0.01;
    } else {
      for (let i = 2; i < times.length; i += 1) times[i] = (times[i] / max) * maxTime;
    }
  }
  return times.map((time, index) => ({ time, phi: phis[index] }));
}

function polygonExtents(roi: Point[]) {
  const open = roi.length > 1 && roi[0].x === roi[roi.length - 1].x && roi[0].y === roi[roi.length - 1].y ? roi.slice(0, -1) : roi;
  return {
    open,
    minX: Math.min(...open.map((point) => point.x)), maxX: Math.max(...open.map((point) => point.x)),
    minY: Math.min(...open.map((point) => point.y)), maxY: Math.max(...open.map((point) => point.y)),
  };
}

function compactShiftingRoi(roi: Point[]) {
  if (roi.length < 2) return roi.map((point) => ({ ...point }));
  const keep = new Set<number>();
  let runStart = 0;
  for (let index = 1; index <= roi.length; index += 1) {
    if (index < roi.length && roi[index].x === roi[index - 1].x) continue;
    keep.add(runStart);
    keep.add(index - 1);
    runStart = index;
  }
  return [...keep].sort((a, b) => a - b).map((index) => ({ ...roi[index] }));
}

function shiftingCurves(roi: Point[], request: AnalysisRequest, maxRt1: number) {
  const open = polygonExtents(roi).open;
  if (open.length < 3) throw new Error("The Shifting Gradient ROI needs at least three vertices.");
  const sourceTimes = [...new Set(open.map((point) => point.x))].sort((a, b) => a - b);
  const sourceMin = sourceTimes[0], sourceMax = sourceTimes.at(-1)!;
  if (!(sourceMax > sourceMin)) throw new Error("The Shifting Gradient ROI must span more than one first-dimension time.");

  // Derive both curves from vertical intersections with the polygon. Traversal
  // order is not a reliable start/end indicator and independently rescaling the
  // two polygon chains can make them cross, which creates negative gradients.
  const envelopes = sourceTimes.map((time) => {
    const intersections: number[] = [];
    for (let index = 0; index < open.length; index += 1) {
      const a = open[index], b = open[(index + 1) % open.length];
      if (a.x === b.x) {
        if (time === a.x) intersections.push(a.y, b.y);
        continue;
      }
      if (time < Math.min(a.x, b.x) || time > Math.max(a.x, b.x)) continue;
      intersections.push(a.y + ((time - a.x) / (b.x - a.x)) * (b.y - a.y));
    }
    if (!intersections.length) throw new Error("Could not determine the Shifting Gradient bounds from the ROI.");
    return { time, lower: Math.min(...intersections), upper: Math.max(...intersections) };
  });
  const targetMin = request.gradient1D[1].time + request.params.dead1D / request.params.flow1D;
  const start = envelopes.map((point) => ({ time: rescale(point.time, sourceMin, sourceMax, targetMin, maxRt1), phi: point.lower * 100 }));
  const end = envelopes.map((point) => ({ time: rescale(point.time, sourceMin, sourceMax, targetMin, maxRt1), phi: point.upper * 100 }));
  const rows = start.map((point, index) => [point.time, point.phi, end[index].time, end[index].phi]);
  return { start, end, rows };
}

async function predictFiF(dataset: Dataset, corrected: Float64Array, roi: Point[], request: AnalysisRequest, progress: Progress) {
  // Match MATLAB's createMask(app.ROI) followed by the bounding row/column
  // ranges. The ROI is already expressed in the displayed chromatogram's
  // coordinates, so subtracting dwell time here selects the wrong columns.
  const mask = matlabCompatiblePolygonMask(dataset.rt1, dataset.rt2, roi);
  let minColumn = dataset.width, maxColumn = -1, minRow = dataset.height, maxRow = -1;
  for (let row = 0; row < dataset.height; row += 1) for (let column = 0; column < dataset.width; column += 1) {
    if (!mask[row * dataset.width + column]) continue;
    minColumn = Math.min(minColumn, column); maxColumn = Math.max(maxColumn, column);
    minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
  }
  if (maxColumn - minColumn < 1 || maxRow - minRow < 1) throw new Error("The FiF ROI must contain at least two rows and two columns.");
  const sourceWidth = maxColumn - minColumn + 1;
  const sourceHeight = maxRow - minRow + 1;
  const selected = new Float64Array(sourceWidth * sourceHeight);
  for (let row = 0; row < sourceHeight; row += 1) {
    for (let column = 0; column < sourceWidth; column += 1) selected[row * sourceWidth + column] = corrected[(row + minRow) * dataset.width + column + minColumn];
  }
  const targetMinX = request.gradient1D[1].time + request.params.dead1D / request.params.flow1D;
  const targetMaxX = dataset.rt1[dataset.rt1.length - 1];
  const targetMinY = request.gradient2D[1].time;
  const targetMaxY = dataset.rt2[dataset.rt2.length - 1];
  const output = new Float64Array(dataset.values.length); output.fill(Number.NaN);
  for (let row = 0; row < dataset.height; row += 1) {
    const y = dataset.rt2[row];
    if (y >= targetMinY && y <= targetMaxY) {
      const sy = rescale(y, targetMinY, targetMaxY, 0, sourceHeight - 1);
      for (let column = 0; column < dataset.width; column += 1) {
        const x = dataset.rt1[column];
        if (x < targetMinX || x > targetMaxX) continue;
        const sx = rescale(x, targetMinX, targetMaxX, 0, sourceWidth - 1);
        output[row * dataset.width + column] = bicubicSample(selected, sourceWidth, sourceHeight, sx, sy);
      }
    }
    if (row % 25 === 0) { progress("Predicting chromatogram", row / dataset.height); await new Promise((resolve) => setTimeout(resolve, 0)); }
  }
  return output;
}

async function predictShifting(dataset: Dataset, corrected: Float64Array, roi: Point[], request: AnalysisRequest, progress: Progress) {
  const mask = matlabCompatiblePolygonMask(dataset.rt1, dataset.rt2, roi);
  let selectedCount = 0;
  for (const value of mask) selectedCount += value;
  if (selectedCount < 3) throw new Error("The ROI does not contain enough chromatogram cells.");
  const targetMinX = request.gradient1D[1].time + request.params.dead1D / request.params.flow1D;
  const targetMaxX = dataset.rt1[dataset.rt1.length - 1];
  const targetMinY = request.gradient2D[1].time;
  const targetMaxY = dataset.rt2[dataset.rt2.length - 1];

  // MATLAB upsamples the masked arrays by 2×100 before remapping them. Compute
  // only the strip that can remain finite after cubic convolution and stream
  // its samples into the scattered interpolator. This preserves the exact
  // resolution without allocating three roughly seven-million-value arrays.
  const scaleX = 100, scaleY = 2;
  const virtualWidth = dataset.width * scaleX, virtualHeight = dataset.height * scaleY;
  const maskedData = new Float64Array(dataset.values.length);
  const maskedTime1 = new Float64Array(dataset.values.length);
  const maskedTime2 = new Float64Array(dataset.values.length);
  maskedData.fill(Number.NaN); maskedTime1.fill(Number.NaN); maskedTime2.fill(Number.NaN);
  for (let row = 0; row < dataset.height; row += 1) for (let column = 0; column < dataset.width; column += 1) {
    const index = row * dataset.width + column;
    if (!mask[index]) continue;
    maskedData[index] = corrected[index];
    maskedTime1[index] = dataset.rt1[column];
    maskedTime2[index] = dataset.rt2[row];
  }

  const reflect = (index: number, length: number) => {
    let result = index;
    while (result < 0 || result >= length) result = result < 0 ? -result - 1 : 2 * length - result - 1;
    return result;
  };
  const strictBicubic = (values: Float64Array, x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let weighted = 0, total = 0;
    const weight = (distance: number) => {
      const value = Math.abs(distance), a = -0.5;
      if (value <= 1) return (a + 2) * value ** 3 - (a + 3) * value ** 2 + 1;
      if (value < 2) return a * value ** 3 - 5 * a * value ** 2 + 8 * a * value - 4 * a;
      return 0;
    };
    for (let sourceRow = iy - 1; sourceRow <= iy + 2; sourceRow += 1) for (let sourceColumn = ix - 1; sourceColumn <= ix + 2; sourceColumn += 1) {
      const combinedWeight = weight(x - sourceColumn) * weight(y - sourceRow);
      if (Math.abs(combinedWeight) < 1e-15) continue;
      const value = values[reflect(sourceRow, dataset.height) * dataset.width + reflect(sourceColumn, dataset.width)];
      if (!Number.isFinite(value)) return Number.NaN;
      weighted += value * combinedWeight; total += combinedWeight;
    }
    return Math.abs(total) < 1e-12 ? Number.NaN : weighted / total;
  };

  const rowMinX = new Float64Array(virtualHeight); rowMinX.fill(Number.POSITIVE_INFINITY);
  const rowMaxX = new Float64Array(virtualHeight); rowMaxX.fill(Number.NEGATIVE_INFINITY);
  const columnMinY = new Float64Array(virtualWidth); columnMinY.fill(Number.POSITIVE_INFINITY);
  const columnMaxY = new Float64Array(virtualWidth); columnMaxY.fill(Number.NEGATIVE_INFINITY);
  const firstColumn = new Int32Array(virtualHeight); firstColumn.fill(-1);
  const lastColumn = new Int32Array(virtualHeight); lastColumn.fill(-1);
  let maskMinRow = dataset.height, maskMaxRow = -1, maskMinColumn = dataset.width, maskMaxColumn = -1;
  for (let row = 0; row < dataset.height; row += 1) for (let column = 0; column < dataset.width; column += 1) {
    if (!mask[row * dataset.width + column]) continue;
    maskMinRow = Math.min(maskMinRow, row); maskMaxRow = Math.max(maskMaxRow, row);
    maskMinColumn = Math.min(maskMinColumn, column); maskMaxColumn = Math.max(maskMaxColumn, column);
  }
  const virtualStartRow = Math.max(0, Math.floor(scaleY * (maskMinRow - 1.5) - .5));
  const virtualEndRow = Math.min(virtualHeight - 1, Math.ceil(scaleY * (maskMaxRow + 2.5) - .5));
  const virtualStartColumn = Math.max(0, Math.floor(scaleX * (maskMinColumn - 1.5) - .5));
  const virtualEndColumn = Math.min(virtualWidth - 1, Math.ceil(scaleX * (maskMaxColumn + 2.5) - .5));
  for (let row = virtualStartRow; row <= virtualEndRow; row += 1) {
    const sourceY = (row + 0.5) / scaleY - 0.5;
    for (let column = virtualStartColumn; column <= virtualEndColumn; column += 1) {
      const sourceX = (column + 0.5) / scaleX - 0.5;
      const x = strictBicubic(maskedTime1, sourceX, sourceY);
      const y = strictBicubic(maskedTime2, sourceX, sourceY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (firstColumn[row] < 0) firstColumn[row] = column;
      lastColumn[row] = column;
      rowMinX[row] = Math.min(rowMinX[row], x); rowMaxX[row] = Math.max(rowMaxX[row], x);
      columnMinY[column] = Math.min(columnMinY[column], y); columnMaxY[column] = Math.max(columnMaxY[column], y);
    }
    if (row % 80 === 0) { progress("Resampling Shifting Gradient ROI", .3 * (row - virtualStartRow) / Math.max(1, virtualEndRow - virtualStartRow)); await new Promise((resolve) => setTimeout(resolve, 0)); }
  }

  let pointCount = 0;
  let pointX = new Float64Array(65_536), pointY = new Float64Array(65_536), pointValue = new Float64Array(65_536);
  const appendPoint = (x: number, y: number, value: number) => {
    if (pointCount === pointX.length) {
      const nextX = new Float64Array(pointCount * 2), nextY = new Float64Array(pointCount * 2), nextValue = new Float64Array(pointCount * 2);
      nextX.set(pointX); nextY.set(pointY); nextValue.set(pointValue);
      pointX = nextX; pointY = nextY; pointValue = nextValue;
    }
    pointX[pointCount] = x; pointY[pointCount] = y; pointValue[pointCount] = value; pointCount += 1;
  };
  const interpolationStride = 1;
  for (let row = virtualStartRow; row <= virtualEndRow; row += 1) {
    if (!Number.isFinite(rowMinX[row]) || rowMaxX[row] === rowMinX[row]) continue;
    const sourceY = (row + 0.5) / scaleY - 0.5;
    for (let column = firstColumn[row]; column <= lastColumn[row]; column += 1) {
      if ((column - firstColumn[row]) % interpolationStride !== 0 && column !== lastColumn[row]) continue;
      if (!Number.isFinite(columnMinY[column]) || columnMaxY[column] === columnMinY[column]) continue;
      const sourceX = (column + 0.5) / scaleX - 0.5;
      const x = strictBicubic(maskedTime1, sourceX, sourceY);
      const y = strictBicubic(maskedTime2, sourceX, sourceY);
      const value = strictBicubic(maskedData, sourceX, sourceY);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value)) continue;
      appendPoint(
        rescale(x, rowMinX[row], rowMaxX[row], targetMinX, targetMaxX),
        rescale(y, columnMinY[column], columnMaxY[column], targetMinY, targetMaxY),
        value,
      );
    }
    if (row % 80 === 0) { progress("Preparing cubic prediction", .3 + .2 * (row - virtualStartRow) / Math.max(1, virtualEndRow - virtualStartRow)); await new Promise((resolve) => setTimeout(resolve, 0)); }
  }
  const points: ScatteredSamples = { x: pointX.slice(0, pointCount), y: pointY.slice(0, pointCount), value: pointValue.slice(0, pointCount) };
  return triangulatedCubicGrid(points, dataset.rt1, dataset.rt2, (value) => progress("Triangulating prediction", value));
}

export async function analyzeDataset(dataset: Dataset, request: AnalysisRequest, progress: Progress = () => {}) : Promise<AnalysisResult> {
  validateAnalysis(request);
  validateStrictlyIncreasing(dataset.rt1, "First-dimension retention times");
  validateStrictlyIncreasing(dataset.rt2, "Second-dimension retention times");
  progress("Correcting dead times", 0.08);
  const { corrected, detection, t01 } = transformChromatogram(dataset, request);
  progress("Detecting signal bounds", 0.18);
  const detectionResult = detectRoi(dataset, request, detection);
  const sourceRoi = closePolygon((request.roi?.length ? request.roi : detectionResult.autoRoi).map((point) => ({ ...point })));
  const roi = request.method === "Shifting gradient" ? compactShiftingRoi(sourceRoi) : sourceRoi;
  const { minX, maxX, minY, maxY } = polygonExtents(roi);
  const td1 = request.params.dwell1D / request.params.flow1D;
  const td2 = request.params.dwell2D / request.params.flow2D;
  const maxRt1 = dataset.rt1[dataset.rt1.length - 1], maxRt2 = dataset.rt2[dataset.rt2.length - 1];
  const optimized1D = optimizeGradient(request.gradient1D, [minX - td1 - t01, maxX - td1 - t01], maxRt1, (time) => phi1(request, maxRt1, time), td1 + t01);
  let optimized2D: number[][];
  if (request.method === "FiF") {
    optimized2D = optimizeGradient(request.gradient2D, [minY - td2, maxY - td2], maxRt2, (time) => phi2(request, maxRt2, time), td2)
      .map((point) => [point.time, point.phi]);
  } else {
    optimized2D = shiftingCurves(roi, request, maxRt1).rows;
  }
  let predicted: Float64Array | undefined;
  if (request.includePrediction) {
    predicted = request.method === "FiF"
      ? await predictFiF(dataset, corrected, roi, request, progress)
      : await predictShifting(dataset, corrected, roi, request, progress);
  }
  progress("Preparing plots", 0.96);
  const meta: DatasetMeta = {
    fileName: dataset.fileName, sheetName: dataset.sheetName, rows: dataset.height, columns: dataset.width,
    cells: dataset.width * dataset.height,
    estimatedPeakMemoryMb: Math.round((dataset.width * dataset.height * 8 * 7 / 1024 / 1024) * 10) / 10,
    rt1: dataset.rt1, rt2: dataset.rt2,
  };
  const predictedDisplay = predicted
    ? downsamplePeak(predicted, dataset.width, dataset.height, dataset.rt1[0], maxRt1, dataset.rt2[0], maxRt2)
    : undefined;
  return {
    meta,
    raw: downsamplePeak(dataset.values, dataset.width, dataset.height, dataset.rt1[0], maxRt1, dataset.rt2[0], maxRt2),
    corrected: downsamplePeak(corrected, dataset.width, dataset.height, dataset.rt1[0], maxRt1, dataset.rt2[0], maxRt2),
    // Triangulation can create a handful of very large edge overshoots. Keep
    // the calculated/downloaded values exact, but prevent those outliers from
    // washing out the useful JET color contrast in Shifting Gradient mode.
    predicted: predictedDisplay && request.method === "Shifting gradient"
      ? robustDisplayRange(predictedDisplay)
      : predictedDisplay,
    predictionData: predicted ? { width: dataset.width, height: dataset.height, values: predicted, rt1: dataset.rt1, rt2: dataset.rt2 } : undefined,
    roi, optimized1D, optimized2D,
    threshold: detectionResult.threshold, detectedPixels: detectionResult.detectedPixels,
    boundaries: {
      phi1Start: phi1(request, maxRt1, minX), phi1End: phi1(request, maxRt1, maxX),
      phi2Start: phi2(request, maxRt2, minY), phi2End: phi2(request, maxRt2, maxY),
      time1Start: minX - td1 - t01, time1End: maxX - td1 - t01,
      time2Start: minY - td2, time2End: maxY - td2,
    },
  };
}
