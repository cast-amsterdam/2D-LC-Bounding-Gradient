export interface PngLegendItem {
  label: string;
  color?: string;
  dashed?: boolean;
  gradient?: readonly string[];
}

interface PlotPngOptions {
  title: string;
  source: HTMLCanvasElement | SVGSVGElement;
  legend: readonly PngLegendItem[];
  caption: string;
}

const EXPORT_SCALE = 2;
const EXPORT_TEXT = "#171424";
const EXPORT_MUTED = "#57516b";

function wrapText(context: CanvasRenderingContext2D, text: string, maximumWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maximumWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function svgImage(source: SVGSVGElement) {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "540");
  clone.setAttribute("height", "280");
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The selected plot could not be rendered as PNG."));
    });
    return image;
  } finally {
    // The decoded image remains available after the object URL is released.
    URL.revokeObjectURL(url);
  }
}

function sourceDimensions(source: HTMLCanvasElement | SVGSVGElement) {
  if (source instanceof HTMLCanvasElement) {
    const rectangle = source.getBoundingClientRect();
    const width = Math.max(540, Math.round(rectangle.width || source.width));
    const height = Math.max(280, Math.round((rectangle.height || source.height) * width / Math.max(1, rectangle.width || source.width)));
    return { width, height };
  }
  return { width: 540, height: 280 };
}

function drawLegend(context: CanvasRenderingContext2D, items: readonly PngLegendItem[], x: number, y: number, maximumWidth: number) {
  context.font = "700 11px system-ui, sans-serif";
  context.fillStyle = EXPORT_TEXT;
  context.fillText("LEGEND", x, y);
  let cursorX = x + 62;
  let cursorY = y;
  context.font = "12px system-ui, sans-serif";
  for (const item of items) {
    const swatchWidth = item.gradient ? 48 : 26;
    const itemWidth = swatchWidth + 8 + context.measureText(item.label).width + 18;
    if (cursorX + itemWidth > x + maximumWidth) { cursorX = x; cursorY += 24; }
    if (item.gradient) {
      const gradient = context.createLinearGradient(cursorX, 0, cursorX + swatchWidth, 0);
      item.gradient.forEach((color, index) => gradient.addColorStop(index / Math.max(1, item.gradient!.length - 1), color));
      context.fillStyle = gradient;
      context.fillRect(cursorX, cursorY - 8, swatchWidth, 8);
    } else {
      context.strokeStyle = item.color ?? EXPORT_MUTED;
      context.lineWidth = 2;
      context.setLineDash(item.dashed ? [5, 4] : []);
      context.beginPath(); context.moveTo(cursorX, cursorY - 4); context.lineTo(cursorX + swatchWidth, cursorY - 4); context.stroke();
      context.setLineDash([]);
    }
    context.fillStyle = EXPORT_MUTED;
    context.fillText(item.label, cursorX + swatchWidth + 8, cursorY);
    cursorX += itemWidth;
  }
  return cursorY;
}

async function renderPlotPng({ title, source, legend, caption }: PlotPngOptions) {
  const dimensions = sourceDimensions(source);
  const padding = 24, headingHeight = 42, footerHeight = 112;
  const logicalWidth = dimensions.width + padding * 2;
  const logicalHeight = padding + headingHeight + dimensions.height + footerHeight + padding;
  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth * EXPORT_SCALE;
  canvas.height = logicalHeight * EXPORT_SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG export is not supported by this browser.");
  context.scale(EXPORT_SCALE, EXPORT_SCALE);
  // Leave the surrounding canvas transparent so pasted figures do not carry
  // the application's card background or decorative border.
  context.fillStyle = EXPORT_TEXT;
  context.font = "700 18px system-ui, sans-serif";
  context.fillText(title, padding, padding + 21);

  const plotTop = padding + headingHeight;
  const renderedSource = source instanceof HTMLCanvasElement ? source : await svgImage(source);
  context.drawImage(renderedSource, padding, plotTop, dimensions.width, dimensions.height);

  const legendBottom = drawLegend(context, legend, padding, plotTop + dimensions.height + 30, dimensions.width);
  context.fillStyle = EXPORT_MUTED;
  context.font = "12px system-ui, sans-serif";
  const captionLines = wrapText(context, caption, dimensions.width);
  captionLines.slice(0, 2).forEach((line, index) => context.fillText(line, padding, legendBottom + 31 + index * 17));
  context.fillStyle = "#6f6980";
  context.font = "10px system-ui, sans-serif";
  context.fillText("2D-LC Bounding Gradient · locally generated", padding, logicalHeight - 14);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The PNG could not be created.")), "image/png"));
}

export async function copyPlotPng(options: PlotPngOptions) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Copying PNG images is not supported in this browser context.");
  }
  // Give the clipboard the pending PNG immediately so browsers that require
  // a transient click activation do not lose it while an SVG is rendered.
  const png = renderPlotPng(options);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
