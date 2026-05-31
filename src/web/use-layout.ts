import { useEffect, useState } from "react";
import type { Timeframe } from "../shared/types.js";

export interface CellConfig {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  showEmas?: boolean;
  showHtfZones?: boolean;
  /** Render Heikin-Ashi candles instead of raw OHLC. Indicators still run on raw data. */
  heikinAshi?: boolean;
  /** Hide open-trade ENTRY/SL/TP price lines on the chart (declutter). */
  hideTrades?: boolean;
  /** Show S/R zone overlays (default false — toggle to enable). */
  showZones?: boolean;
  /** Show Elliott wave labels (default false — toggle to enable). */
  showWaves?: boolean;
  /** Show Bollinger Bands overlay (default false). */
  showBollinger?: boolean;
  /** Show RSI sub-chart below (default false). */
  showRsi?: boolean;
}

export interface GridLayoutConfig {
  cols: number;
  cells: CellConfig[];
}

export interface NamedLayout {
  id: string;
  name: string;
  config: GridLayoutConfig;
}

export interface LayoutsRoot {
  active: GridLayoutConfig;
  saved: NamedLayout[];
  /** Layout saved before entering triplet mode — restored on exit. */
  preTriplet?: GridLayoutConfig;
}

const STORAGE_KEY = "trading-app:layout-v2";
const LEGACY_KEY = "trading-app:layout-v1";

const DEFAULT_LAYOUT: GridLayoutConfig = {
  cols: 2,
  cells: [
    { id: "c1", symbol: "BTCUSDT", timeframe: "5m" },
    { id: "c2", symbol: "ETHUSDT", timeframe: "5m" },
    { id: "c3", symbol: "SOLUSDT", timeframe: "5m" },
    { id: "c4", symbol: "PAXGUSDT", timeframe: "5m" },
  ],
};

const DEFAULT_ROOT: LayoutsRoot = { active: DEFAULT_LAYOUT, saved: [] };

/**
 * Grid layout with localStorage persistence + named presets.
 *
 * Active layout = the one currently rendered.
 * Saved layouts = a library you can apply with one click ("Morning crypto",
 * "Gold session", "VN equities", etc.).
 *
 * Migrates from v1 (just the active layout) by upgrading on first load.
 */
export function useLayout() {
  const [root, setRoot] = useState<LayoutsRoot>(() => {
    try {
      const v2 = localStorage.getItem(STORAGE_KEY);
      if (v2) {
        const parsed = JSON.parse(v2) as LayoutsRoot;
        if (parsed?.active?.cells) return parsed;
      }
      const v1 = localStorage.getItem(LEGACY_KEY);
      if (v1) {
        const parsed = JSON.parse(v1) as GridLayoutConfig;
        if (parsed?.cells) return { active: parsed, saved: [] };
      }
    } catch {
      /* corrupt storage — fall through to default */
    }
    return DEFAULT_ROOT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    } catch {
      /* quota — ignore, in-memory still works */
    }
  }, [root]);

  const layout = root.active;

  const updateActive = (
    patch: (prev: GridLayoutConfig) => GridLayoutConfig,
  ) => {
    setRoot((r) => ({ ...r, active: patch(r.active) }));
  };

  const updateCell = (id: string, patch: Partial<CellConfig>) => {
    updateActive((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const addCell = () => {
    updateActive((prev) => ({
      ...prev,
      cells: [
        ...prev.cells,
        {
          id: `c${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          symbol: "BTCUSDT",
          timeframe: "5m",
        },
      ],
    }));
  };

  const removeCell = (id: string) => {
    updateActive((prev) => ({
      ...prev,
      cells: prev.cells.filter((c) => c.id !== id),
    }));
  };

  const setCols = (cols: number) => {
    updateActive((prev) => ({ ...prev, cols: Math.max(1, Math.min(6, cols)) }));
  };

  const reset = () =>
    setRoot((r) => ({
      ...r,
      active: r.preTriplet ?? DEFAULT_LAYOUT,
      preTriplet: undefined,
    }));

  /**
   * Open the active symbol as a 3-cell H1/15m/5m triplet. All three cells
   * share the same symbol, so the click-bus syncs them: clicking a bar on
   * any one scrolls the other two to the same area. Mirrors the user's
   * "1H + 15m + 5m" mental workflow from the screenshot triplets.
   *
   * Replaces the current layout entirely — switches cols=3, drops other
   * cells. Use a saved preset to come back to the prior layout.
   */
  const openTriplet = (symbol: string) => {
    const now = Date.now();
    const triplet: GridLayoutConfig = {
      cols: 3,
      cells: [
        {
          id: `tr-h1-${now}`,
          symbol,
          timeframe: "1h",
          showEmas: true,
          showHtfZones: false,
        },
        {
          id: `tr-15m-${now + 1}`,
          symbol,
          timeframe: "15m",
          showEmas: true,
          showHtfZones: true,
        },
        {
          id: `tr-5m-${now + 2}`,
          symbol,
          timeframe: "5m",
          showEmas: true,
          showHtfZones: true,
        },
      ],
    };
    // Save current layout so reset() can restore it.
    setRoot((r) => ({ ...r, active: triplet, preTriplet: r.active }));
  };

  // ──────── Named presets ────────

  const saveCurrent = (name: string) => {
    if (!name.trim()) return;
    setRoot((r) => ({
      ...r,
      saved: [
        ...r.saved.filter((s) => s.name !== name),
        { id: `s${Date.now()}`, name, config: r.active },
      ],
    }));
  };

  const applySaved = (id: string) => {
    setRoot((r) => {
      const found = r.saved.find((s) => s.id === id);
      if (!found) return r;
      return { ...r, active: found.config };
    });
  };

  const deleteSaved = (id: string) => {
    setRoot((r) => ({ ...r, saved: r.saved.filter((s) => s.id !== id) }));
  };

  return {
    layout,
    saved: root.saved,
    updateCell,
    addCell,
    removeCell,
    setCols,
    reset,
    saveCurrent,
    applySaved,
    deleteSaved,
    openTriplet,
  };
}
