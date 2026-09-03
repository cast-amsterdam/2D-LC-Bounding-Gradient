import { describe, expect, it } from "vitest";
import { closestPointOnPolyline, convexHull, interpLinear, nearestIndex, otsu256, pointInPolygon, rescale, robustDisplayRange } from "./numerics";

describe("numeric compatibility helpers", () => {
  it("chooses the first nearest index on a tie", () => expect(nearestIndex([0, 2, 4], 3)).toBe(1));
  it("interpolates and rescales linearly", () => {
    expect(interpLinear([{ time: 0, phi: 5 }, { time: 10, phi: 95 }], 5)).toBe(50);
    expect(rescale(5, 0, 10, 20, 40)).toBe(30);
  });
  it("computes a separating 256-bin Otsu threshold", () => {
    const values = new Float64Array([0, 0, 0.01, 0.02, 0.9, 0.98, 1, 1]);
    expect(otsu256(values)).toBeGreaterThanOrEqual(0.02);
    expect(otsu256(values)).toBeLessThan(0.9);
  });
  it("returns a closed convex hull and supports masks", () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: .5, y: .5 }]);
    expect(hull).toHaveLength(5);
    expect(hull[0]).toEqual(hull.at(-1));
    expect(pointInPolygon(.5, .5, hull)).toBe(true);
    expect(pointInPolygon(2, 2, hull)).toBe(false);
  });
  it("projects a pointer onto the nearest ROI edge", () => {
    const hit = closestPointOnPolyline({ x: 6, y: 2 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(hit?.segmentIndex).toBe(0);
    expect(hit?.point).toEqual({ x: 6, y: 0 });
    expect(hit?.distance).toBe(2);
  });
  it("uses robust color limits without changing heatmap values", () => {
    const values = new Float32Array([0, 10, 11, 12, 13, 14, 15, 16, 17, 1000]);
    const grid = { width: 5, height: 2, values, xMin: 0, xMax: 1, yMin: 0, yMax: 1, valueMin: 0, valueMax: 1000 };
    const adjusted = robustDisplayRange(grid, .1, .9);
    expect(adjusted.values).toBe(values);
    expect(adjusted.valueMin).toBeCloseTo(9, 12);
    expect(adjusted.valueMax).toBeCloseTo(115.3, 10);
  });
});
