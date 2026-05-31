# Phase 02 — Compose Screenshot Util

## Overview
Priority: P0. Status: pending. Depends on phase 01.
Pure module that captures registered charts and composites a branded PNG canvas.

## Files
- CREATE `src/web/chart-screenshot.ts`

## API
```ts
import type { CellConfig } from "./use-layout.js";
export interface ShareImageOpts {
  cells: CellConfig[];   // grid order
  cols: number;          // layout.cols
  appName?: string;      // default "Trading App"
}
export function composeShareImage(opts: ShareImageOpts): HTMLCanvasElement | null;
```

## Logic
1. For each cell in `cells`: `const h = chartRegistry.get(cell.id)`; skip if missing.
   - `const main = h.chart.takeScreenshot()` → canvas.
   - `const rsi = h.rsiChart ? h.rsiChart.takeScreenshot() : null`.
   - Cell tile height = `main.height + (rsi ? GAP + rsi.height : 0)`; width = `main.width`.
2. Grid math: `rows = ceil(n / cols)`. Column width = max tile width in that column
   (simplest: global max width). Row height = max tile height in that row.
3. Master canvas:
   - `dpr = window.devicePixelRatio || 1`
   - `PAD = 16*dpr`, `HEADER = 40*dpr`, `GAP = 8*dpr`
   - width = `PAD*2 + sum(colWidths) + GAP*(cols-1)`
   - height = `PAD*2 + HEADER + sum(rowHeights) + GAP*(rows-1)`
   - fill bg `#0d1117` (match dark theme).
4. Header text (left-aligned, y in header band):
   - `${appName} · ${symbols.join(", ")} · ${utc} GMT`
   - `symbols` = unique cell symbols; `utc = new Date().toUTCString()`.
   - font `${13*dpr}px Inter, system-ui, sans-serif`, color `#c9d1d9`.
5. Draw tiles: walk cells row-major; `drawImage(main, x, y)`; if rsi, `drawImage(rsi, x, y+main.height+GAP)`.
6. Return master canvas. Return `null` if zero captured (caller shows error).

## Notes
- `takeScreenshot()` already returns canvas at device px → do NOT re-scale tiles; just multiply layout constants by `dpr` so spacing matches.
- Each tile already shows its own symbol/OHLC legend + axes (rendered by lightweight-charts), so no per-tile label needed.
- KISS: global-max column width is fine for 1–3 equal cells; uneven sizes just get padding.

## Todo
- [ ] Implement composeShareImage with capture loop + grid math + header
- [ ] Handle RSI stacking under its tile
- [ ] Return null on empty; dpr-aware constants
- [ ] tsc compiles clean

## Success
Calling with current layout returns a canvas visually matching the grid + header
band; 1/2/3 column layouts arrange correctly; RSI appears under its cell.
