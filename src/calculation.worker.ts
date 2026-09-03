/// <reference lib="webworker" />
import { analyzeDataset, type Dataset } from "./core/engine";
import { parseWorkbook } from "./core/xlsx";
import type { AnalysisResult, WorkerRequest, WorkerResponse } from "./types";

const context: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
let dataset: Dataset | undefined;
let activeJob = 0;

const send = (message: WorkerResponse, transfer: Transferable[] = []) => context.postMessage(message, transfer);

function resultTransfer(result: AnalysisResult): Transferable[] {
  const buffers = [result.raw.values.buffer, result.corrected.values.buffer];
  if (result.predicted) buffers.push(result.predicted.values.buffer);
  if (result.predictionData) buffers.push(result.predictionData.values.buffer);
  return buffers as Transferable[];
}

context.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  activeJob = request.jobId;
  try {
    if (request.type === "reset") {
      dataset = undefined;
      return;
    }
    if (request.type === "load") {
      if (request.buffer.byteLength > request.limits.maxFileMb * 1024 * 1024) throw new Error(`The workbook exceeds the configured ${request.limits.maxFileMb} MB file-size limit.`);
      send({ type: "progress", jobId: request.jobId, stage: "Reading workbook", value: 0.03 });
      dataset = parseWorkbook(request.fileName, request.buffer, request.limits.maxCells);
    }
    if (!dataset) throw new Error("Load a chromatogram workbook before calculating.");
    const analysis = request.analysis;
    const result = await analyzeDataset(dataset, analysis, (stage, value) => {
      if (activeJob === request.jobId) send({ type: "progress", jobId: request.jobId, stage, value });
    });
    if (activeJob !== request.jobId) return;
    send({ type: "result", jobId: request.jobId, result }, resultTransfer(result));
  } catch (error) {
    if (activeJob === request.jobId) send({ type: "error", jobId: request.jobId, message: error instanceof Error ? error.message : String(error) });
  }
};
