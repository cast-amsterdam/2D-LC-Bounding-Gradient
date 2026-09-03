import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { triangulatedCubicGrid } from "./numerics";

const readCsv = async (name: string) => (await readFile(resolve(process.cwd(), "tests", "fixtures", name), "utf8"))
  .trim().split(/\r?\n/).map((line) => line.split(",").map(Number));

it("matches the small MATLAB griddata cubic reference", async () => {
  const samples = (await readCsv("cubic_samples.csv")).map(([x, y, value]) => ({ x, y, value }));
  const x = (await readCsv("cubic_x.csv")).flat();
  const y = (await readCsv("cubic_y.csv")).flat();
  const reference = (await readCsv("cubic_reference.csv")).flat();
  const actual = await triangulatedCubicGrid(samples, x, y);
  const pairs = reference.map((value, index) => [value, actual[index]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const rmse = Math.sqrt(pairs.reduce((sum, [a, b]) => sum + (a - b) ** 2, 0) / pairs.length);
  const max = Math.max(...pairs.map(([a, b]) => Math.abs(a - b)));
  expect(max).toBeLessThan(1e-12);
  expect(rmse).toBeLessThan(1e-10);
});
