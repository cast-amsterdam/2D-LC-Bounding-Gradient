export type Method = "FiF" | "Shifting gradient";

export interface GradientPoint {
  time: number;
  phi: number;
}

export interface InstrumentParams {
  dwell1D: number;
  dead1D: number;
  flow1D: number;
  dwell2D: number;
  dead2D: number;
  flow2D: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface AnalysisRequest {
  method: Method;
  params: InstrumentParams;
  gradient1D: GradientPoint[];
  gradient2D: GradientPoint[];
  roi?: Point[];
  includePrediction: boolean;
}

export interface DisplayGrid {
  width: number;
  height: number;
  values: Float32Array;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  valueMin: number;
  valueMax: number;
}

export interface DatasetMeta {
  fileName: string;
  sheetName: string;
  rows: number;
  columns: number;
  cells: number;
  estimatedPeakMemoryMb: number;
  rt1: number[];
  rt2: number[];
}

export interface AnalysisResult {
  meta: DatasetMeta;
  raw: DisplayGrid;
  corrected: DisplayGrid;
  predicted?: DisplayGrid;
  predictionData?: {
    width: number;
    height: number;
    values: Float64Array;
    rt1: number[];
    rt2: number[];
  };
  roi: Point[];
  optimized1D: GradientPoint[];
  optimized2D: number[][];
  threshold: number;
  detectedPixels: number;
  boundaries: {
    phi1Start: number;
    phi1End: number;
    phi2Start: number;
    phi2End: number;
    time1Start: number;
    time1End: number;
    time2Start: number;
    time2End: number;
  };
}

export interface Limits {
  maxFileMb: number;
  maxCells: number;
}

export type WorkerRequest =
  | { type: "load"; jobId: number; fileName: string; buffer: ArrayBuffer; limits: Limits; analysis: AnalysisRequest }
  | { type: "analyze"; jobId: number; analysis: AnalysisRequest }
  | { type: "reset"; jobId: number };

export type WorkerResponse =
  | { type: "progress"; jobId: number; stage: string; value: number }
  | { type: "result"; jobId: number; result: AnalysisResult }
  | { type: "error"; jobId: number; message: string };
