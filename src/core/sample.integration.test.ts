import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYSIS } from "./defaults";
import { analyzeDataset } from "./engine";
import { matlabCompatiblePolygonMask } from "./numerics";
import { parseWorkbook } from "./xlsx";

describe("supplied MixTest workbook", () => {
  it("loads and completes the default FiF workflow", async () => {
    const bytes = await readFile(resolve(process.cwd(), "public", "example", "MixTest.xlsx"));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const dataset = parseWorkbook("MixTest.xlsx", buffer, 2_000_000);
    const result = await analyzeDataset(dataset, DEFAULT_ANALYSIS);
    expect(result.meta.rows).toBe(606);
    expect(result.meta.columns).toBe(58);
    expect(result.threshold).toBeCloseTo(0.18823529411764706, 14);
    expect(result.detectedPixels).toBe(1217);
    const td1 = DEFAULT_ANALYSIS.params.dwell1D / DEFAULT_ANALYSIS.params.flow1D;
    expect(result.roi[0].x).toBeCloseTo(dataset.rt1[5] + td1, 12);
    expect(result.roi[1].x).toBeCloseTo(dataset.rt1[23] + td1, 12);
    expect(result.roi[0].y).toBeCloseTo(dataset.rt2[605], 12);
    expect(result.roi[2].y).toBeCloseTo(dataset.rt2[450], 12);
    expect(result.optimized1D.length).toBeGreaterThanOrEqual(2);
    expect(result.optimized2D.length).toBeGreaterThanOrEqual(2);
    expect(result.optimized1D).toEqual([
      { time: 0, phi: 5 },
      { time: 1, phi: 5 },
      { time: 58.1275673, phi: 78.8576795 },
    ]);
    const matlab2D = [[0, 5], [.16, 5], [.17, 86.7035921875], [.09281874022575358, 100], [.2656185942811703, 100]];
    result.optimized2D.forEach((row, i) => row.forEach((value, j) => expect(value).toBeCloseTo(matlab2D[i][j], 12)));
    expect(result.predictionData?.values.some(Number.isFinite)).toBe(true);
    const maskReference = await readFile(resolve(process.cwd(), "tests", "fixtures", "mix_test_fif_mask.bin"));
    const webMask = matlabCompatiblePolygonMask(dataset.rt1, dataset.rt2, result.roi);
    let maskMismatches = 0;
    for (let row = 0; row < dataset.height; row += 1) for (let column = 0; column < dataset.width; column += 1) {
      if ((webMask[row * dataset.width + column] !== 0) !== (maskReference[column * dataset.height + row] !== 0)) maskMismatches += 1;
    }
    expect(maskMismatches).toBe(0);
    const referenceBytes = await readFile(resolve(process.cwd(), "tests", "fixtures", "mix_test_fif_prediction.bin"));
    const referenceView = new DataView(referenceBytes.buffer, referenceBytes.byteOffset, referenceBytes.byteLength);
    const reference = Array.from({ length: referenceBytes.byteLength / 8 }, (_, i) => referenceView.getFloat64(i * 8, true));
    const actual = result.predictionData!.values;
    const pairs: Array<[number, number]> = [];
    let finiteMaskMismatches = 0;
    for (let row = 0; row < result.meta.rows; row += 1) for (let column = 0; column < result.meta.columns; column += 1) {
      const expected = reference[column * result.meta.rows + row];
      const observed = actual[row * result.meta.columns + column];
      if (Number.isFinite(expected) !== Number.isFinite(observed)) finiteMaskMismatches += 1;
      if (Number.isFinite(expected) && Number.isFinite(observed)) pairs.push([expected, observed]);
    }
    const meanExpected = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
    const meanObserved = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    let covariance = 0, expectedVariance = 0, observedVariance = 0, squaredError = 0;
    for (const [expected, observed] of pairs) {
      covariance += (expected - meanExpected) * (observed - meanObserved);
      expectedVariance += (expected - meanExpected) ** 2; observedVariance += (observed - meanObserved) ** 2;
      squaredError += (expected - observed) ** 2;
    }
    const correlation = covariance / Math.sqrt(expectedVariance * observedVariance);
    const expectedValues = pairs.map((pair) => pair[0]);
    const normalizedRmse = Math.sqrt(squaredError / pairs.length) / (Math.max(...expectedValues) - Math.min(...expectedValues));
    expect(correlation).toBeGreaterThanOrEqual(.995);
    expect(normalizedRmse).toBeLessThanOrEqual(.02);
    expect(finiteMaskMismatches).toBeLessThanOrEqual(2 * (result.meta.rows + result.meta.columns));
  }, 30_000);

  it("completes the full Shifting gradient workflow", async () => {
    const bytes = await readFile(resolve(process.cwd(), "public", "example", "MixTest.xlsx"));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const dataset = parseWorkbook("MixTest.xlsx", buffer, 2_000_000);
    const result = await analyzeDataset(dataset, { ...DEFAULT_ANALYSIS, method: "Shifting gradient" });
    expect(result.threshold).toBeCloseTo(0.18823529411764706, 14);
    expect(result.detectedPixels).toBe(1217);
    const readCsv = async (name: string) => (await readFile(resolve(process.cwd(), "tests", "fixtures", name), "utf8"))
      .trim().split(/\r?\n/).map((line) => line.split(",").map(Number));
    const matlabRoi = await readCsv("mix_test_shifting_roi.csv");
    const matlabOptimized1D = await readCsv("mix_test_shifting_optimized_1d.csv");
    expect(result.roi.length).toBe(matlabRoi.length);
    result.roi.forEach((point, index) => {
      expect(point.x).toBeCloseTo(matlabRoi[index][0], 12);
      expect(point.y).toBeCloseTo(matlabRoi[index][1], 12);
    });
    result.optimized1D.forEach((point, index) => {
      expect(point.time).toBeCloseTo(matlabOptimized1D[index][0], 12);
      expect(point.phi).toBeCloseTo(matlabOptimized1D[index][1], 12);
    });
    expect(result.optimized2D.length).toBeGreaterThanOrEqual(2);
    expect(result.optimized2D.every((row) => row.length === 4)).toBe(true);
    result.optimized2D.forEach(([startTime, startPhi, endTime, endPhi]) => {
      expect([startTime, startPhi, endTime, endPhi].every(Number.isFinite)).toBe(true);
      expect(startTime).toBeCloseTo(endTime, 12);
      expect(startPhi, `Negative Shifting Gradient envelope at ${startTime} min`).toBeLessThanOrEqual(endPhi);
    });
    expect(result.predictionData?.values.some(Number.isFinite)).toBe(true);
    const maskReference = await readFile(resolve(process.cwd(), "tests", "fixtures", "mix_test_shifting_mask.bin"));
    const webMask = matlabCompatiblePolygonMask(dataset.rt1, dataset.rt2, result.roi);
    let webMaskCount = 0, maskMismatches = 0;
    for (let row = 0; row < dataset.height; row += 1) for (let column = 0; column < dataset.width; column += 1) {
      const webInside = webMask[row * dataset.width + column] !== 0;
      const matlabInside = maskReference[column * dataset.height + row] !== 0;
      if (webInside) webMaskCount += 1;
      if (webInside !== matlabInside) maskMismatches += 1;
    }
    expect(maskMismatches, `ROI mask mismatches=${maskMismatches}, web count=${webMaskCount}`).toBe(0);
    const referenceBytes = await readFile(resolve(process.cwd(), "tests", "fixtures", "mix_test_shifting_prediction.bin"));
    const referenceView = new DataView(referenceBytes.buffer, referenceBytes.byteOffset, referenceBytes.byteLength);
    const actual = result.predictionData!.values;
    const pairs: Array<[number, number]> = [];
    let finiteMaskMismatches = 0;
    for (let row = 0; row < result.meta.rows; row += 1) for (let column = 0; column < result.meta.columns; column += 1) {
      const expected = referenceView.getFloat64((column * result.meta.rows + row) * 8, true);
      const observed = actual[row * result.meta.columns + column];
      if (Number.isFinite(expected) !== Number.isFinite(observed)) finiteMaskMismatches += 1;
      if (Number.isFinite(expected) && Number.isFinite(observed)) pairs.push([expected, observed]);
    }
    const meanExpected = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
    const meanObserved = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    let covariance = 0, expectedVariance = 0, observedVariance = 0, squaredError = 0;
    for (const [expected, observed] of pairs) {
      covariance += (expected - meanExpected) * (observed - meanObserved);
      expectedVariance += (expected - meanExpected) ** 2;
      observedVariance += (observed - meanObserved) ** 2;
      squaredError += (expected - observed) ** 2;
    }
    const correlation = covariance / Math.sqrt(expectedVariance * observedVariance);
    const expectedValues = pairs.map((pair) => pair[0]);
    const normalizedRmse = Math.sqrt(squaredError / pairs.length) / (Math.max(...expectedValues) - Math.min(...expectedValues));
    const metricSummary = `correlation=${correlation}, normalizedRmse=${normalizedRmse}, finiteMaskMismatches=${finiteMaskMismatches}, pairedValues=${pairs.length}`;
    expect(correlation, `Shifting prediction ${metricSummary}`).toBeGreaterThanOrEqual(.995);
    expect(normalizedRmse, `Shifting prediction normalized RMSE was ${normalizedRmse}`).toBeLessThanOrEqual(.02);
    expect(finiteMaskMismatches, `Shifting prediction finite-mask mismatches: ${finiteMaskMismatches}`).toBeLessThanOrEqual(2 * (result.meta.rows + result.meta.columns));

    // A manually edited ROI must drive both the returned ROI and prediction;
    // this prevents a stale automatic ROI from being reused after dragging.
    const translatedRoi = result.roi.map((point) => ({ x: point.x + 5, y: point.y }));
    const translated = await analyzeDataset(dataset, { ...DEFAULT_ANALYSIS, method: "Shifting gradient", roi: translatedRoi });
    expect(translated.roi).toEqual(translatedRoi);
    const translatedMask = matlabCompatiblePolygonMask(dataset.rt1, dataset.rt2, translated.roi);
    let changedMaskCells = 0, changedPredictionCells = 0;
    for (let index = 0; index < webMask.length; index += 1) {
      if (webMask[index] !== translatedMask[index]) changedMaskCells += 1;
      const before = result.predictionData!.values[index], after = translated.predictionData!.values[index];
      if (Number.isFinite(before) && Number.isFinite(after) && Math.abs(before - after) > 1) changedPredictionCells += 1;
    }
    expect(changedMaskCells).toBeGreaterThan(100);
    expect(changedPredictionCells).toBeGreaterThan(100);
  }, 180_000);
});
