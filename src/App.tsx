import { useEffect, useMemo, useRef, useState } from "react";
import InlineWorker from "./calculation.worker?worker&inline";
import { DEFAULT_ANALYSIS } from "./core/defaults";
import { downloadText, gradientCsv, predictedCsv, tableCsv } from "./core/export";
import { extendToEnd, shiftingTrace } from "./core/plot";
import { validateAnalysis } from "./core/validation";
import { GradientTable, ResultTable } from "./components/GradientTable";
import { Heatmap } from "./components/Heatmap";
import { LineChart, type Series } from "./components/LineChart";
import type { AnalysisRequest, AnalysisResult, InstrumentParams, Limits, Point, WorkerRequest, WorkerResponse } from "./types";

interface Props { assetBase: string; exampleUrl: string; limits: Limits }

const cloneDefaults = (): AnalysisRequest => JSON.parse(JSON.stringify(DEFAULT_ANALYSIS));
const safeFileStem = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");

export function App({ assetBase, exampleUrl, limits }: Props) {
  const worker = useMemo(() => new InlineWorker(), []);
  const [analysis, setAnalysis] = useState<AnalysisRequest>(cloneDefaults);
  const [result, setResult] = useState<AnalysisResult>();
  const [roi, setRoi] = useState<Point[]>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ stage: "Ready", value: 0 });
  const [error, setError] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const activeJob = useRef(0);
  const previewTimer = useRef<number | undefined>(undefined);
  const automaticTimer = useRef<number | undefined>(undefined);
  const analysisRef = useRef(analysis); analysisRef.current = analysis;
  const roiRef = useRef(roi); roiRef.current = roi;

  useEffect(() => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.jobId !== activeJob.current) return;
      if (message.type === "progress") { setBusy(true); setProgress({ stage: message.stage, value: message.value }); }
      if (message.type === "error") { setBusy(false); setError(message.message); setProgress({ stage: "Could not calculate", value: 0 }); }
      if (message.type === "result") {
        setBusy(false); setError(undefined); setLoaded(true); setRoi(message.result.roi);
        setResult((previous) => ({
          ...message.result,
          predicted: message.result.predicted ?? previous?.predicted,
          predictionData: message.result.predictionData ?? previous?.predictionData,
        }));
        setProgress({ stage: "Calculation complete", value: 1 });
      }
    };
    return () => { worker.terminate(); if (previewTimer.current) window.clearTimeout(previewTimer.current); if (automaticTimer.current) window.clearTimeout(automaticTimer.current); };
  }, [worker]);

  const postAnalysis = (next: AnalysisRequest, nextRoi: Point[] | undefined, includePrediction: boolean) => {
    try { validateAnalysis(next); } catch (validationError) { setError(validationError instanceof Error ? validationError.message : String(validationError)); return; }
    const jobId = ++activeJob.current; setBusy(true); setError(undefined); setProgress({ stage: includePrediction ? "Recalculating prediction for selected ROI" : "Updating ROI", value: 0.02 });
    if (includePrediction) setResult((previous) => previous ? { ...previous, predicted: undefined, predictionData: undefined } : previous);
    const message: WorkerRequest = { type: "analyze", jobId, analysis: { ...next, roi: nextRoi, includePrediction } };
    worker.postMessage(message);
  };

  useEffect(() => {
    if (!loaded) return;
    if (automaticTimer.current) window.clearTimeout(automaticTimer.current);
    automaticTimer.current = window.setTimeout(() => postAnalysis(analysisRef.current, roiRef.current, true), 500);
  }, [analysis, loaded]);

  const loadFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { setError("Choose an .xlsx workbook."); return; }
    if (file.size > limits.maxFileMb * 1024 * 1024) { setError(`The workbook exceeds the configured ${limits.maxFileMb} MB file-size limit.`); return; }
    const next = cloneDefaults(); setAnalysis(next); setRoi(undefined); setResult(undefined); setLoaded(false); setFileName(file.name); setError(undefined); setBusy(true);
    const jobId = ++activeJob.current; setProgress({ stage: "Reading workbook", value: 0.01 });
    const buffer = await file.arrayBuffer();
    const message: WorkerRequest = { type: "load", jobId, fileName: file.name, buffer, limits, analysis: next };
    worker.postMessage(message, [buffer]);
  };
  const loadExample = async () => {
    try {
      setBusy(true); setError(undefined); setProgress({ stage: "Loading example workbook", value: 0.01 });
      const response = await fetch(exampleUrl);
      if (!response.ok) throw new Error(`Example workbook could not be loaded (${response.status}).`);
      const blob = await response.blob();
      await loadFile(new File([blob], "MixTest.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    } catch (loadError) {
      setBusy(false); setProgress({ stage: "Could not load example", value: 0 });
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  };

  const updateParam = (key: keyof InstrumentParams, value: number) => setAnalysis((current) => ({ ...current, params: { ...current.params, [key]: value } }));
  const changeMethod = (method: AnalysisRequest["method"]) => { setRoi(undefined); setAnalysis((current) => ({ ...current, method })); };
  const changeRoi = (next: Point[], commit: boolean) => {
    setRoi(next); roiRef.current = next;
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    if (commit) postAnalysis(analysisRef.current, next, true);
    else previewTimer.current = window.setTimeout(() => postAnalysis(analysisRef.current, next, false), 100);
  };
  const reset = () => { const next = cloneDefaults(); setAnalysis(next); setRoi(undefined); if (loaded) postAnalysis(next, undefined, true); };

  const chromatogramEnd = result?.meta.rt1.at(-1);
  const line1: Series[] = [
    { label: "Scan 1D", color: "#38a8ff", dash: true, points: extendToEnd(analysis.gradient1D.map((point) => ({ x: point.time, y: point.phi })), chromatogramEnd) },
    ...(result ? [{ label: "Optimized 1D", color: "#9b88ff", points: extendToEnd(result.optimized1D.map((point) => ({ x: point.time, y: point.phi })), chromatogramEnd) }] : []),
  ];
  const line2: Series[] = analysis.method === "FiF"
    ? [{ label: "Scan 2D", color: "#d21bbe", points: analysis.gradient2D.map((point) => ({ x: point.time, y: point.phi })) }]
    : result ? [
        { label: "Shifting gradient", color: "#d21bbe", points: shiftingTrace(result.optimized2D, result.meta.rt1) },
        { label: "Start", color: "#38a8ff", points: result.optimized2D.filter((row) => Number.isFinite(row[0])).map((row) => ({ x: row[0], y: row[1] })) },
        { label: "End", color: "#9b88ff", points: result.optimized2D.filter((row) => Number.isFinite(row[2])).map((row) => ({ x: row[2], y: row[3] })) },
      ] : [];
  const stem = safeFileStem(fileName ?? "2d-lc-bounding-gradient");
  const optimized2Headers = analysis.method === "FiF" ? ["Time (min)", "%B"] : ["Start time", "Start %B", "End time", "End %B"];

  return <main className="bg2dlc-app">
    <header className="bg2dlc-topbar">
      <div><p className="bg2dlc-kicker">Comprehensive two-dimensional liquid chromatography</p><h1>2D-LC Bounding Gradient</h1><p className="bg2dlc-subtitle">Define the useful separation region and translate it into optimized mobile-phase programs.</p></div>
      <div className="bg2dlc-header-actions">
        <span className="bg2dlc-privacy"><span />Local processing · nothing uploaded</span>
        <button type="button" className="bg2dlc-secondary-button" onClick={loadExample} disabled={busy}>Load example</button>
        <label className="bg2dlc-primary-button">Load XLSX<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => loadFile(event.target.files?.[0])} /></label>
        <button type="button" className="bg2dlc-secondary-button" onClick={reset}>Reset</button>
      </div>
    </header>

    <div className="bg2dlc-status" aria-live="polite">
      <div><strong>{progress.stage}</strong>{result && <span>{result.meta.fileName} · {result.meta.rows.toLocaleString()} × {result.meta.columns.toLocaleString()} · ~{result.meta.estimatedPeakMemoryMb} MB peak working memory</span>}</div>
      {busy && <div className="bg2dlc-progress"><span style={{ width: `${Math.max(4, progress.value * 100)}%` }} /></div>}
    </div>
    {error && <div className="bg2dlc-error" role="alert"><strong>Check the input</strong><span>{error}</span></div>}
    <details className="bg2dlc-input-help">
      <summary>How should the XLSX input data look?</summary>
      <div className="bg2dlc-input-help-content">
        <div>
          <p>The app reads the <strong>first worksheet</strong>. Arrange it as a rectangular matrix:</p>
          <ul>
            <li>Row 1, starting at B1: strictly increasing <strong>1D retention times</strong> in minutes.</li>
            <li>Column A, starting at A2: strictly increasing <strong>2D retention times</strong> in minutes.</li>
            <li>B2 onward: one finite numeric signal intensity for every combination of 1D and 2D time.</li>
            <li>A1 may be empty or contain a label. Do not place blank, merged, text, NaN, or infinite cells inside the numeric matrix.</li>
          </ul>
          <p className="bg2dlc-input-limits">Accepted format: .xlsx · maximum {limits.maxFileMb} MB · maximum {limits.maxCells.toLocaleString()} intensity cells.</p>
        </div>
        <figure className="bg2dlc-sheet-example">
          <table aria-label="Example XLSX worksheet layout">
            <thead><tr><th /><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
            <tbody>
              <tr><th>1</th><td className="is-corner">time (min)</td><td className="is-axis">1.0</td><td className="is-axis">2.0</td><td className="is-axis">3.0</td></tr>
              <tr><th>2</th><td className="is-axis">0.001</td><td>12543</td><td>13120</td><td>12886</td></tr>
              <tr><th>3</th><td className="is-axis">0.003</td><td>12701</td><td>18492</td><td>13774</td></tr>
              <tr><th>4</th><td className="is-axis">0.005</td><td>12481</td><td>14635</td><td>12992</td></tr>
            </tbody>
          </table>
          <figcaption><span>Blue cells: time axes</span><span>Other cells: signal intensity</span></figcaption>
        </figure>
      </div>
    </details>

    <div className="bg2dlc-workspace">
      <aside className="bg2dlc-controls">
        <section className="bg2dlc-panel"><div className="bg2dlc-section-title"><span>01</span><h2>Instrument</h2></div>
          <label className="bg2dlc-field"><span>Method</span><select value={analysis.method} onChange={(event) => changeMethod(event.target.value as AnalysisRequest["method"])}><option>FiF</option><option>Shifting gradient</option></select></label>
          <div className="bg2dlc-dimension"><h3>First dimension</h3><NumberField label="Dwell volume (mL)" value={analysis.params.dwell1D} onChange={(value) => updateParam("dwell1D", value)} /><NumberField label="Dead volume (mL)" value={analysis.params.dead1D} onChange={(value) => updateParam("dead1D", value)} /><NumberField label="Flow rate (mL·min⁻¹)" value={analysis.params.flow1D} onChange={(value) => updateParam("flow1D", value)} /></div>
          <div className="bg2dlc-dimension"><h3>Second dimension</h3><NumberField label="Dwell volume (mL)" value={analysis.params.dwell2D} onChange={(value) => updateParam("dwell2D", value)} /><NumberField label="Dead volume (mL)" value={analysis.params.dead2D} onChange={(value) => updateParam("dead2D", value)} /><NumberField label="Flow rate (mL·min⁻¹)" value={analysis.params.flow2D} onChange={(value) => updateParam("flow2D", value)} /></div>
        </section>
        <section className="bg2dlc-panel"><div className="bg2dlc-section-title"><span>02</span><h2>Scan programs</h2></div><GradientTable title="Scan 1D gradient" points={analysis.gradient1D} onChange={(gradient1D) => setAnalysis((current) => ({ ...current, gradient1D }))} /><GradientTable title="Scan 2D gradient" points={analysis.gradient2D} onChange={(gradient2D) => setAnalysis((current) => ({ ...current, gradient2D }))} /></section>
      </aside>

      <section className="bg2dlc-main-stage">
        <div className="bg2dlc-section-title"><span>03</span><div><h2>Select the useful separation region</h2><p>{analysis.method === "Shifting gradient" ? "Drag the red region or its handles. Double-click a red edge to add a node." : "Drag the red region or its handles. Prediction updates when released."}</p></div></div>
        <Heatmap title="ROI selection" grid={result?.corrected} roi={roi} method={analysis.method} editable={Boolean(result)} onRoiChange={changeRoi} />
        <div className="bg2dlc-stat-row"><Stat label="Threshold" value={result ? result.threshold.toFixed(4) : "—"} /><Stat label="Detected pixels" value={result?.detectedPixels.toLocaleString() ?? "—"} /><Stat label="Method" value={analysis.method} /></div>
      </section>

      <aside className="bg2dlc-results">
        <div className="bg2dlc-section-title"><span>04</span><h2>Optimized programs</h2></div>
        <ResultTable title="Optimized 1D gradient" headers={["Time (min)", "%B"]} rows={result?.optimized1D.map((point) => [point.time, point.phi])} />
        <ResultTable title="Optimized 2D gradient" headers={optimized2Headers} rows={result?.optimized2D} />
        <div className="bg2dlc-downloads"><h3>Download results</h3><button disabled={!result} onClick={() => result && downloadText(`${stem}-optimized-1d.csv`, gradientCsv(result.optimized1D))}>Optimized 1D CSV</button><button disabled={!result} onClick={() => result && downloadText(`${stem}-optimized-2d.csv`, tableCsv(optimized2Headers, result.optimized2D))}>Optimized 2D CSV</button><button disabled={!result?.predictionData} onClick={() => result && downloadText(`${stem}-predicted.csv`, predictedCsv(result))}>Predicted matrix CSV</button></div>
      </aside>
    </div>

    <section className="bg2dlc-analysis-grid">
      <Heatmap title="Raw 2D chromatogram" grid={result?.raw} />
      <LineChart title="1D gradient" caption="Scan and optimized first-dimension solvent-composition programs with the selected time and %B bounds." series={line1} xMax={chromatogramEnd} vertical={result ? [result.boundaries.time1Start, result.boundaries.time1End] : []} horizontal={result ? [result.boundaries.phi1Start, result.boundaries.phi1End] : []} />
      <LineChart title="2D gradient" caption={analysis.method === "FiF" ? "Second-dimension scan program with the selected time and %B bounds." : "Optimized shifting-gradient modulation program with its start and end envelopes."} series={line2} xMax={analysis.method === "FiF" ? result?.meta.rt2.at(-1) : result?.meta.rt1.at(-1)} vertical={analysis.method === "FiF" && result ? [result.boundaries.time2Start, result.boundaries.time2End] : []} horizontal={analysis.method === "FiF" && result ? [result.boundaries.phi2Start, result.boundaries.phi2End] : []} />
      <Heatmap title="Predicted 2D chromatogram" grid={result?.predicted} method={analysis.method} emptyMessage={busy ? "Recalculating prediction for selected ROI…" : "Prediction unavailable"} />
    </section>

    <aside className="bg2dlc-publication" aria-label="Associated manuscript">
      <span>Associated research · Submitted manuscript</span>
      <p>This tool accompanies <cite>Rapid Development of Mobile Phase Composition Programs for Comprehensive Two-Dimensional Liquid Chromatography</cite> by Tijmen S. Bos, Dwight R. Stoll, and Bob W.J. Pirok.</p>
    </aside>
    <footer className="bg2dlc-footer"><a href="https://www.uva.nl/en" target="_blank" rel="noreferrer"><img src={`${assetBase}uvalogo_regular_d_en.svg`} alt="University of Amsterdam" /></a><a href="https://cast-amsterdam.org/" target="_blank" rel="noreferrer"><img src={`${assetBase}CAST logo.svg`} alt="CAST Amsterdam" /></a><a href="https://bos-ideas.com/" target="_blank" rel="noreferrer"><img src={`${assetBase}Logo_vector - light filled.svg`} alt="IDEAS" /></a></footer>
  </main>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="bg2dlc-field bg2dlc-number-field"><span>{label}</span><input type="number" min="0" step="any" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="bg2dlc-stat"><span>{label}</span><strong>{value}</strong></div>; }
