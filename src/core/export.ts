import type { AnalysisResult, GradientPoint } from "../types";

const format = (value: number) => Number.isFinite(value) ? Number(value.toPrecision(12)).toString() : "";

export function tableCsv(headers: string[], rows: number[][]): string {
  return [headers.join(","), ...rows.map((row) => row.map(format).join(","))].join("\r\n");
}

export function gradientCsv(points: GradientPoint[]): string {
  return tableCsv(["Time (min)", "%B"], points.map((point) => [point.time, point.phi]));
}

export function predictedCsv(result: AnalysisResult): string {
  if (!result.predictionData) throw new Error("No predicted chromatogram is available.");
  const grid = result.predictionData;
  return [
    ["", ...grid.rt1.map(format)].join(","),
    ...grid.rt2.map((time, row) => [format(time), ...Array.from(grid.values.subarray(row * grid.width, (row + 1) * grid.width), format)].join(",")),
  ].join("\r\n");
}

export function downloadText(name: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
