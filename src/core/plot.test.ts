import { describe, expect, it } from "vitest";
import { cellCenteredRasterRect, shiftingTrace } from "./plot";

describe("plot program construction", () => {
  it("aligns raster cell centres with the first and last axis coordinates", () => {
    const rect = cellCenteredRasterRect(100, 50, 11, 6);
    expect(rect).toEqual({ x: -5, y: -5, width: 110, height: 60 });
    expect(rect.x + rect.width - 5).toBe(100);
    expect(rect.y + rect.height - 5).toBe(50);
  });
  it("never draws a negative shifting-gradient ramp when editable envelopes cross", () => {
    const rows = [[0, 20, 0, 80], [4, 60, 4, 40], [8, 90, 8, 30]];
    const trace = shiftingTrace(rows, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(trace.length).toBeGreaterThan(0);
    for (let index = 0; index < trace.length; index += 3) expect(trace[index + 1].y).toBeGreaterThanOrEqual(trace[index].y);
  });
});
