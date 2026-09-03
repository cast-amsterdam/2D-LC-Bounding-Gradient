import * as XLSX from "xlsx";
import type { Dataset } from "./engine";

export function parseWorkbook(fileName: string, buffer: ArrayBuffer, maxCells: number): Dataset {
  const workbook = XLSX.read(buffer, { type: "array", dense: true, cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook contains no worksheets.");
  const sheet = workbook.Sheets[sheetName];
  const reference = sheet["!ref"];
  if (!reference) throw new Error("The first worksheet is empty.");
  const range = XLSX.utils.decode_range(reference);
  const referencedHeight = range.e.r - range.s.r;
  const referencedWidth = range.e.c - range.s.c;
  if (referencedWidth * referencedHeight > maxCells * 4) throw new Error("The worksheet's referenced range is too large to parse safely. Remove formatting from unused rows or columns and try again.");
  const rows = XLSX.utils.sheet_to_json<(number | string | null)[]>(sheet, { header: 1, raw: true, defval: null });
  const empty = (value: unknown) => value === null || value === "" || value === undefined;
  let width = Math.max(0, (rows[0]?.length ?? 0) - 1);
  while (width > 0 && empty(rows[0]?.[width])) width -= 1;
  let height = Math.max(0, rows.length - 1);
  while (height > 0 && empty(rows[height]?.[0])) height -= 1;
  if (width < 2 || height < 2) throw new Error("The worksheet must contain a time row, a time column, and at least a 2×2 intensity matrix.");
  const cells = width * height;
  if (cells > maxCells) throw new Error(`This worksheet contains ${cells.toLocaleString()} intensity cells; the configured limit is ${maxCells.toLocaleString()}.`);
  const numberAt = (row: number, column: number, label: string) => {
    const raw = rows[row]?.[column];
    if (empty(raw)) throw new Error(`${label} at worksheet cell ${XLSX.utils.encode_cell({ r: row, c: column })} is empty or non-numeric.`);
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${label} at worksheet cell ${XLSX.utils.encode_cell({ r: row, c: column })} is empty or non-numeric.`);
    return value;
  };
  const rt1 = Array.from({ length: width }, (_, column) => numberAt(0, column + 1, "First-dimension time"));
  const rt2 = Array.from({ length: height }, (_, row) => numberAt(row + 1, 0, "Second-dimension time"));
  const values = new Float64Array(cells);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) values[row * width + column] = numberAt(row + 1, column + 1, "Intensity");
  }
  return { fileName, sheetName, rt1, rt2, values, width, height };
}
