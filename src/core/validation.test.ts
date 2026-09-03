import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYSIS } from "./defaults";
import { validateAnalysis, validateStrictlyIncreasing } from "./validation";

describe("scientific input validation", () => {
  it("accepts the MATLAB defaults", () => expect(() => validateAnalysis(DEFAULT_ANALYSIS)).not.toThrow());
  it("rejects zero flow", () => expect(() => validateAnalysis({ ...DEFAULT_ANALYSIS, params: { ...DEFAULT_ANALYSIS.params, flow1D: 0 } })).toThrow(/greater than zero/));
  it("rejects non-increasing axes", () => expect(() => validateStrictlyIncreasing([0, 1, 1], "Axis")).toThrow(/strictly increasing/));
  it("rejects a degenerate gradient", () => expect(() => validateAnalysis({ ...DEFAULT_ANALYSIS, gradient1D: [{ time: 0, phi: 5 }, { time: 0, phi: 90 }] })).toThrow(/strictly increasing/));
});
