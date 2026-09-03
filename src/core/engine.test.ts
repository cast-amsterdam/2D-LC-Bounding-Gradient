import { describe, expect, it } from "vitest";
import type { AnalysisRequest } from "../types";
import { analyzeDataset, type Dataset } from "./engine";

const dataset = (): Dataset => {
  const width = 20, height = 24;
  const rt1 = Array.from({ length: width }, (_, i) => i);
  const rt2 = Array.from({ length: height }, (_, i) => i / (height - 1));
  const values = new Float64Array(width * height);
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const x = (column - 10) / 3.2, y = (row - 16) / 3.5;
    values[row * width + column] = 10 + 1000 * Math.exp(-(x * x + y * y));
  }
  return { fileName: "synthetic.xlsx", sheetName: "Sheet1", rt1, rt2, values, width, height };
};
const request = (method: AnalysisRequest["method"]): AnalysisRequest => ({
  method, includePrediction: true,
  params: { dwell1D: .1, dead1D: .1, flow1D: 1, dwell2D: .01, dead2D: .2, flow2D: 1 },
  gradient1D: [{ time: 0, phi: 5 }, { time: 1, phi: 5 }, { time: 19, phi: 100 }],
  gradient2D: [{ time: 0, phi: 5 }, { time: .1, phi: 5 }, { time: 1, phi: 100 }],
});

describe("analysis engine", () => {
  it("calculates FiF bounds, optimized programs, and a prediction", async () => {
    const result = await analyzeDataset(dataset(), request("FiF"));
    expect(result.detectedPixels).toBeGreaterThan(0); expect(result.roi).toHaveLength(5);
    expect(result.optimized1D.length).toBeGreaterThanOrEqual(2); expect(result.optimized2D[0]).toHaveLength(2);
    expect(result.predictionData?.values.some(Number.isFinite)).toBe(true);
  });
  it("uses the displayed FiF ROI columns without applying dwell time twice", async () => {
    const input = dataset();
    for (let row = 0; row < input.height; row += 1) for (let column = 0; column < input.width; column += 1) {
      input.values[row * input.width + column] = 100 + column;
    }
    const base = request("FiF");
    const roi = [
      { x: 8, y: input.rt2[5] }, { x: 11, y: input.rt2[5] },
      { x: 11, y: input.rt2[18] }, { x: 8, y: input.rt2[18] }, { x: 8, y: input.rt2[5] },
    ];
    const result = await analyzeDataset(input, {
      ...base,
      roi,
      params: { ...base.params, dwell1D: 3, dead1D: 0 },
    });
    const valuesAtPredictionStart = Array.from({ length: input.height }, (_, row) => result.predictionData!.values[row * input.width + 1])
      .filter(Number.isFinite);
    expect(valuesAtPredictionStart.length).toBeGreaterThan(0);
    // createMask excludes the polygon's left boundary and therefore starts at
    // column 9. The old double-dwell path instead started around column 6.
    const meanAtPredictionStart = valuesAtPredictionStart.reduce((sum, value) => sum + value, 0) / valuesAtPredictionStart.length;
    expect(meanAtPredictionStart).toBeGreaterThan(108.5);
    expect(meanAtPredictionStart).toBeLessThan(109.5);
    valuesAtPredictionStart.forEach((value) => expect(value).toBeGreaterThan(108.5));
  });
  it("calculates four-column shifting-gradient output", async () => {
    const result = await analyzeDataset(dataset(), { ...request("Shifting gradient"), includePrediction: false });
    expect(result.optimized2D.length).toBeGreaterThan(1); expect(result.optimized2D[0]).toHaveLength(4);
    result.optimized2D.forEach(([startTime, startPhi, endTime, endPhi]) => {
      expect(startTime).toBeCloseTo(endTime, 12);
      expect(startPhi).toBeLessThanOrEqual(endPhi);
    });
  });
  it("rejects data with no positive signal", async () => {
    const empty = dataset(); empty.values.fill(-1);
    await expect(analyzeDataset(empty, request("FiF"))).rejects.toThrow(/No positive signal/);
  });
});
