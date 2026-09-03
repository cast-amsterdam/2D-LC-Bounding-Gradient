import { afterEach, describe, expect, it, vi } from "vitest";
import { copyPlotPng } from "./plotPng";

describe("plot PNG export", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies the source belonging to the clicked card with its surrounding information", async () => {
    const drawnSources: unknown[] = [];
    const drawnText: string[] = [];
    const clipboardWrites: unknown[][] = [];
    const serializedPlots: string[] = [];
    let roundedRectCalls = 0, strokeRectCalls = 0;
    const context = {
      scale: () => {}, fillRect: () => {}, strokeRect: () => { strokeRectCalls += 1; }, beginPath: () => {}, roundRect: () => { roundedRectCalls += 1; }, stroke: () => {},
      fillText: (text: string) => drawnText.push(text), measureText: (text: string) => ({ width: text.length * 7 }),
      createLinearGradient: () => ({ addColorStop: () => {} }), setLineDash: () => {}, moveTo: () => {}, lineTo: () => {},
      drawImage: (source: unknown) => drawnSources.push(source),
    } as unknown as CanvasRenderingContext2D;
    class FakeCanvas {
      width = 540; height = 280;
      getBoundingClientRect() { return { width: 540, height: 280 }; }
      getContext() { return context; }
      toBlob(callback: BlobCallback) { callback(new Blob(["png"], { type: "image/png" })); }
    }
    class FakeSvg {
      constructor(public id: string) {}
      cloneNode() { return new FakeSvg(this.id); }
      setAttribute() {}
    }
    class FakeImage {
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    const documentMock = { createElement: () => new FakeCanvas() };
    class FakeClipboardItem { constructor(public entries: Record<string, Blob | Promise<Blob>>) {} }
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("XMLSerializer", class { serializeToString(source: FakeSvg) { serializedPlots.push(source.id); return `<svg data-plot="${source.id}" />`; } });
    vi.stubGlobal("document", documentMock);
    vi.stubGlobal("navigator", { clipboard: { write: async (items: unknown[]) => { clipboardWrites.push(items); } } });
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:plot", revokeObjectURL: () => {} });

    const raw = new FakeCanvas() as unknown as HTMLCanvasElement;
    const predicted = new FakeCanvas() as unknown as HTMLCanvasElement;
    await copyPlotPng({
      title: "Raw 2D chromatogram", source: raw,
      legend: [{ label: "Signal intensity", gradient: ["#000080", "#ff0000"] }], caption: "Measured chromatogram.",
    });
    await copyPlotPng({
      title: "Predicted 2D chromatogram", source: predicted,
      legend: [{ label: "Signal intensity", gradient: ["#000080", "#ff0000"] }], caption: "Predicted chromatogram.",
    });
    await copyPlotPng({
      title: "1D gradient", source: new FakeSvg("one-dimensional") as unknown as SVGSVGElement,
      legend: [{ label: "Optimized 1D", color: "#9b88ff" }], caption: "First-dimension gradient.",
    });
    await copyPlotPng({
      title: "2D gradient", source: new FakeSvg("two-dimensional") as unknown as SVGSVGElement,
      legend: [{ label: "Shifting gradient", color: "#d21bbe" }], caption: "Second-dimension gradient.",
    });
    await Promise.all((clipboardWrites.flat() as FakeClipboardItem[]).map((item) => item.entries["image/png"]));

    expect(drawnSources.slice(0, 2)).toEqual([raw, predicted]);
    expect(serializedPlots).toEqual(["one-dimensional", "two-dimensional"]);
    expect(clipboardWrites).toHaveLength(4);
    clipboardWrites.flat().forEach((item) => expect(item).toBeInstanceOf(FakeClipboardItem));
    expect(roundedRectCalls).toBe(0);
    expect(strokeRectCalls).toBe(0);
    expect(drawnText).toEqual(expect.arrayContaining([
      "Raw 2D chromatogram", "Predicted 2D chromatogram", "1D gradient", "2D gradient", "LEGEND", "Measured chromatogram.",
      "Predicted chromatogram.", "First-dimension gradient.", "Second-dimension gradient.", "2D-LC Bounding Gradient · locally generated",
    ]));
  });
});
