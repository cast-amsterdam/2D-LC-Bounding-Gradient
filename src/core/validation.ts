import type { AnalysisRequest, GradientPoint, InstrumentParams } from "../types";

const finite = (value: number) => Number.isFinite(value);

export function validateGradient(points: GradientPoint[], label: string): void {
  if (points.length < 2) throw new Error(`${label} must contain at least two rows.`);
  points.forEach((point, index) => {
    if (!finite(point.time) || point.time < 0) throw new Error(`${label} row ${index + 1}: time must be a non-negative number.`);
    if (!finite(point.phi) || point.phi < 0 || point.phi > 100) throw new Error(`${label} row ${index + 1}: %B must be between 0 and 100.`);
    if (index > 0 && point.time <= points[index - 1].time) throw new Error(`${label} times must be strictly increasing.`);
  });
}

export function validateInstrument(params: InstrumentParams): void {
  const volumes: Array<[keyof InstrumentParams, string]> = [
    ["dwell1D", "Dwell volume 1D"], ["dead1D", "Dead volume 1D"],
    ["dwell2D", "Dwell volume 2D"], ["dead2D", "Dead volume 2D"],
  ];
  for (const [key, label] of volumes) {
    if (!finite(params[key]) || params[key] < 0) throw new Error(`${label} must be a non-negative number.`);
  }
  for (const [key, label] of [["flow1D", "Flow rate 1D"], ["flow2D", "Flow rate 2D"]] as const) {
    if (!finite(params[key]) || params[key] <= 0) throw new Error(`${label} must be greater than zero.`);
  }
}

export function validateAnalysis(request: AnalysisRequest): void {
  validateInstrument(request.params);
  validateGradient(request.gradient1D, "Scan 1D gradient");
  validateGradient(request.gradient2D, "Scan 2D gradient");
}

export function validateStrictlyIncreasing(values: number[], label: string): void {
  if (values.length < 2) throw new Error(`${label} must contain at least two values.`);
  for (let i = 0; i < values.length; i += 1) {
    if (!finite(values[i])) throw new Error(`${label} contains an empty or non-numeric value.`);
    if (i > 0 && values[i] <= values[i - 1]) throw new Error(`${label} must be strictly increasing.`);
  }
}
