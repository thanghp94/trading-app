# Phase 01 — Chart Registry

## Overview
Priority: P0 (blocks all). Status: pending.
Expose each cell's `IChartApi` so the share handler can capture them. Mirror the
existing `crosshair-bus.ts` / `click-bus.ts` module-level pub/sub pattern.

## Why
`Chart.tsx` creates `IChartApi` internally in `chartRef`; nothing outside can
reach it. Registry gives the share function a lookup by cell id, in grid order.

## Files
- CREATE `src/web/chart-registry.ts`
- EDIT `src/web/components/Chart.tsx`
- EDIT `src/web/components/ChartCell.tsx`

## chart-registry.ts
Module-level `Map<string, ChartHandle>`:
```ts
import type { IChartApi } from "lightweight-charts";
export interface ChartHandle {
  chart: IChartApi;
  rsiChart: IChartApi | null;   // null when RSI sub-chart hidden
  symbol: string;
  timeframe: string;
}
const handles = new Map<string, ChartHandle>();
export const chartRegistry = {
  register(id: string, h: ChartHandle): void { handles.set(id, h); },
  unregister(id: string): void { handles.delete(id); },
  get(id: string): ChartHandle | undefined { return handles.get(id); },
};
```
Note: `rsiChart` must update when RSI toggles. Simplest: expose a
`setRsiChart(id, chart|null)` updater, OR re-register on rsi effect. Use a small
`update(id, patch)` method to patch `rsiChart` from Chart's RSI effect.

## Chart.tsx changes
- Add props: `id: string` and `timeframe: string` (after `symbol`).
- In chart-init effect (after `chartRef.current = chart`): `chartRegistry.register(id, { chart, rsiChart: null, symbol, timeframe })`.
- In RSI effect: after creating/removing `rsiChartRef.current`, call `chartRegistry.update(id, { rsiChart: rsiChartRef.current })`.
- In cleanup return: `chartRegistry.unregister(id)`.
- Keep `id`/`timeframe`/`symbol` current via existing ref pattern if needed (id is stable per cell, fine to capture).

## ChartCell.tsx changes
Pass to `<Chart>`: `id={cell.id}` and `timeframe={cell.timeframe}`.

## Todo
- [ ] Create chart-registry.ts with register/unregister/get/update
- [ ] Add id+timeframe props to Chart, register/unregister, update rsiChart on toggle
- [ ] Pass cell.id + cell.timeframe from ChartCell
- [ ] tsc compiles clean

## Success
`chartRegistry.get(cellId)` returns live `IChartApi` while cell mounted; entry
removed on unmount; `rsiChart` non-null only when RSI visible.
