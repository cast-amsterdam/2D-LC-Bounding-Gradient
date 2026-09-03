import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "./xlsx";

describe("XLSX chromatogram import", () => {
  const workbookBuffer = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([[null, 0, 1, 2], [0, 1, 2, 3], [.5, 4, 5, 6], [1, 7, 8, 9]]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Chromatogram");
    return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  };
  it("extracts axes and the intensity matrix", () => {
    const parsed = parseWorkbook("test.xlsx", workbookBuffer(), 100);
    expect(parsed.sheetName).toBe("Chromatogram"); expect(parsed.width).toBe(3); expect(parsed.height).toBe(3);
    expect(parsed.rt1).toEqual([0, 1, 2]); expect(parsed.rt2).toEqual([0, .5, 1]); expect([...parsed.values]).toEqual([1,2,3,4,5,6,7,8,9]);
  });
  it("enforces configured cell limits", () => expect(() => parseWorkbook("test.xlsx", workbookBuffer(), 8)).toThrow(/configured limit/));
  it("rejects gaps in the intensity matrix", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[null, 0, 1], [0, 1, null], [1, 2, 3]]), "Broken");
    expect(() => parseWorkbook("broken.xlsx", XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer, 100)).toThrow(/Intensity/);
  });
});
