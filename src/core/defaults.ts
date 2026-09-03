import type { AnalysisRequest } from "../types";

export const DEFAULT_ANALYSIS: AnalysisRequest = {
  method: "FiF",
  params: {
    dwell1D: 0.225,
    dead1D: 0.265,
    flow1D: 0.032,
    dwell2D: 0.07,
    dead2D: 1.47,
    flow2D: 2,
  },
  gradient1D: [
    { time: 0, phi: 5 },
    { time: 1, phi: 5 },
    { time: 20, phi: 100 },
  ],
  gradient2D: [
    { time: 0, phi: 5 },
    { time: 0.16, phi: 5 },
    { time: 0.8, phi: 100 },
  ],
  includePrediction: true,
};
