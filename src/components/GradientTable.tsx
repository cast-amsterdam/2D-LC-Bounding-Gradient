import type { GradientPoint } from "../types";

interface Props { title: string; points: GradientPoint[]; onChange: (points: GradientPoint[]) => void }

export function GradientTable({ title, points, onChange }: Props) {
  const update = (index: number, key: keyof GradientPoint, value: string) => onChange(points.map((point, i) => i === index ? { ...point, [key]: Number(value) } : point));
  const addIntermediateRow = () => {
    const finalIndex = points.length - 1;
    const before = points[finalIndex - 1];
    const final = points[finalIndex];
    onChange([
      ...points.slice(0, finalIndex),
      {
        time: before.time + (final.time - before.time) / 2,
        phi: before.phi + (final.phi - before.phi) / 2,
      },
      final,
    ]);
  };
  return <section className="bg2dlc-table-card">
    <div className="bg2dlc-table-heading"><h3>{title}</h3><button type="button" className="bg2dlc-icon-button" onClick={addIntermediateRow}>+ intermediate row</button></div>
    <div className="bg2dlc-table-scroll"><table><thead><tr><th>Time (min)</th><th>%B</th><th aria-label="Actions" /></tr></thead><tbody>
      {points.map((point, index) => <tr key={index}><td><input aria-label={`${title} time row ${index + 1}`} type="number" min="0" step="any" value={point.time} onChange={(event) => update(index, "time", event.target.value)} /></td><td><input aria-label={`${title} percent B row ${index + 1}`} type="number" min="0" max="100" step="any" value={point.phi} onChange={(event) => update(index, "phi", event.target.value)} /></td><td><button type="button" className="bg2dlc-remove" disabled={points.length <= 2 || index < 2} onClick={() => onChange(points.filter((_, i) => i !== index))} aria-label={`Remove ${title} row ${index + 1}`} title={index < 2 ? "The initial point and hold endpoint cannot be removed." : undefined}>×</button></td></tr>)}
    </tbody></table></div>
  </section>;
}

export function ResultTable({ title, headers, rows }: { title: string; headers: string[]; rows?: number[][] }) {
  return <section className="bg2dlc-table-card bg2dlc-result-table"><h3>{title}</h3><div className="bg2dlc-table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>
    {rows?.length ? rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <td key={cell}>{Number.isFinite(value) ? Number(value.toPrecision(7)) : ""}</td>)}</tr>) : <tr><td colSpan={headers.length} className="bg2dlc-empty-cell">Awaiting data</td></tr>}
  </tbody></table></div></section>;
}
