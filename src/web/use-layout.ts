import { useEffect, useState } from 'react';
import type { Timeframe } from '../shared/types.js';

export interface CellConfig {
  id: string;
  symbol: string;
  timeframe: Timeframe;
}

export interface GridLayoutConfig {
  cols: number; // 1..4
  cells: CellConfig[];
}

const STORAGE_KEY = 'trading-app:layout-v1';

const DEFAULT_LAYOUT: GridLayoutConfig = {
  cols: 2,
  cells: [
    { id: 'c1', symbol: 'BTCUSDT', timeframe: '5m' },
    { id: 'c2', symbol: 'ETHUSDT', timeframe: '5m' },
    { id: 'c3', symbol: 'SOLUSDT', timeframe: '5m' },
    { id: 'c4', symbol: 'PAXGUSDT', timeframe: '5m' },
  ],
};

/**
 * Grid layout state with localStorage persistence. Each cell tracks its own
 * (symbol, timeframe). Layout survives reload.
 *
 * The grid is fixed `cols`-wide; rows grow naturally with cell count via
 * CSS grid auto-flow. To go from 4 charts to 12, just add 8 more — the
 * grid handles wrapping.
 */
export function useLayout() {
  const [layout, setLayout] = useState<GridLayoutConfig>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GridLayoutConfig;
        if (parsed?.cells?.length) return parsed;
      }
    } catch {
      /* ignore corrupt storage */
    }
    return DEFAULT_LAYOUT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      /* quota exceeded — ignore, in-memory state still works for the session */
    }
  }, [layout]);

  const updateCell = (id: string, patch: Partial<CellConfig>) => {
    setLayout((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const addCell = () => {
    setLayout((prev) => ({
      ...prev,
      cells: [
        ...prev.cells,
        { id: `c${Date.now()}-${Math.floor(Math.random() * 1000)}`, symbol: 'BTCUSDT', timeframe: '5m' },
      ],
    }));
  };

  const removeCell = (id: string) => {
    setLayout((prev) => ({ ...prev, cells: prev.cells.filter((c) => c.id !== id) }));
  };

  const setCols = (cols: number) => {
    setLayout((prev) => ({ ...prev, cols: Math.max(1, Math.min(6, cols)) }));
  };

  const reset = () => setLayout(DEFAULT_LAYOUT);

  return { layout, updateCell, addCell, removeCell, setCols, reset };
}
