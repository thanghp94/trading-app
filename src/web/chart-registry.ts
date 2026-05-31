import type { IChartApi } from "lightweight-charts";

export interface ChartHandle {
  chart: IChartApi;
  /** RSI sub-chart instance — null when the RSI pane is hidden. */
  rsiChart: IChartApi | null;
}

const handles = new Map<string, ChartHandle>();

/**
 * Module-level registry of live chart APIs, keyed by cell id.
 *
 * Mirrors crosshair-bus.ts / click-bus.ts: pure module state, no React context.
 * Lets the share/screenshot handler reach each cell's IChartApi (which Chart.tsx
 * otherwise keeps private) to call takeScreenshot() across the whole grid.
 */
export const chartRegistry = {
  register(id: string, h: ChartHandle): void {
    handles.set(id, h);
  },
  unregister(id: string): void {
    handles.delete(id);
  },
  get(id: string): ChartHandle | undefined {
    return handles.get(id);
  },
  update(id: string, patch: Partial<ChartHandle>): void {
    const cur = handles.get(id);
    if (cur) handles.set(id, { ...cur, ...patch });
  },
};
