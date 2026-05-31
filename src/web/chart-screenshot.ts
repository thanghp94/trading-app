import { chartRegistry } from "./chart-registry.js";

export interface ShareCell {
  id: string;
  symbol: string;
}

export interface ShareImageOpts {
  /** Cells in display order (grid: layout.cells; triplet: the 3 panes). */
  cells: ShareCell[];
  /** Number of grid columns (grid: layout.cols; triplet: 3). */
  cols: number;
  appName?: string;
}

interface Tile {
  main: HTMLCanvasElement;
  rsi: HTMLCanvasElement | null;
  symbol: string;
}

/**
 * Capture every registered chart cell and composite a single branded PNG canvas.
 *
 * Tiles are laid out to match the on-screen grid (cells in order, `cols` wide).
 * Each chart's takeScreenshot() canvas is already at devicePixelRatio, so layout
 * constants are scaled by dpr to keep header spacing proportional to chart pixels.
 * Returns null when no cells are currently registered (nothing to capture).
 */
export function composeShareImage(
  opts: ShareImageOpts,
): HTMLCanvasElement | null {
  const { cells, cols, appName = "Trading App" } = opts;
  const dpr = window.devicePixelRatio || 1;
  const GAP = Math.round(8 * dpr);
  const PAD = Math.round(16 * dpr);
  const HEADER = Math.round(40 * dpr);

  const tiles: Tile[] = [];
  for (const cell of cells) {
    const h = chartRegistry.get(cell.id);
    if (!h) continue;
    tiles.push({
      main: h.chart.takeScreenshot(),
      rsi: h.rsiChart ? h.rsiChart.takeScreenshot() : null,
      symbol: cell.symbol,
    });
  }
  if (tiles.length === 0) return null;

  const colCount = Math.max(1, cols);
  const rowCount = Math.ceil(tiles.length / colCount);
  const tileH = (t: Tile): number =>
    t.main.height + (t.rsi ? GAP + t.rsi.height : 0);

  // Column widths = max width in that column; row heights = max height in that row.
  const colW = new Array<number>(colCount).fill(0);
  const rowH = new Array<number>(rowCount).fill(0);
  tiles.forEach((t, i) => {
    const c = i % colCount;
    const r = Math.floor(i / colCount);
    colW[c] = Math.max(colW[c], t.main.width);
    rowH[r] = Math.max(rowH[r], tileH(t));
  });

  const gridW = colW.reduce((a, b) => a + b, 0) + GAP * (colCount - 1);
  const gridH = rowH.reduce((a, b) => a + b, 0) + GAP * (rowCount - 1);
  const W = PAD * 2 + gridW;
  const H = PAD * 2 + HEADER + gridH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, W, H);

  const symbols = Array.from(new Set(tiles.map((t) => t.symbol))).join(", ");
  ctx.fillStyle = "#c9d1d9";
  ctx.font = `${Math.round(13 * dpr)}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(
    `${appName} · ${symbols} · ${new Date().toUTCString()}`,
    PAD,
    PAD + HEADER / 2,
  );

  // Precompute column x and row y offsets.
  const colX = new Array<number>(colCount).fill(0);
  let acc = PAD;
  for (let c = 0; c < colCount; c += 1) {
    colX[c] = acc;
    acc += colW[c] + GAP;
  }
  const rowY = new Array<number>(rowCount).fill(0);
  acc = PAD + HEADER;
  for (let r = 0; r < rowCount; r += 1) {
    rowY[r] = acc;
    acc += rowH[r] + GAP;
  }

  tiles.forEach((t, i) => {
    const x = colX[i % colCount];
    const y = rowY[Math.floor(i / colCount)];
    ctx.drawImage(t.main, x, y);
    if (t.rsi) ctx.drawImage(t.rsi, x, y + t.main.height + GAP);
  });

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<void> {
  const blob = await canvasToBlob(canvas);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Defer revoke: the browser dispatches the download async after click(); a
  // synchronous revoke can cancel it (Firefox / Chrome under load).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy PNG to clipboard. Returns false on perm/insecure-context failure. */
export async function copyCanvas(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await canvasToBlob(canvas);
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
