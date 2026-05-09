import { useMemo } from 'react';
import type { Candle } from '../shared/types.js';
import { ema } from '../shared/indicators/ema.js';

export interface EmaSeries {
  period: number;
  color: string;
  values: number[];
}

const PRESET: Array<{ period: number; color: string }> = [
  { period: 20, color: '#f1c40f' },
  { period: 50, color: '#9b59b6' },
  { period: 200, color: '#e67e22' },
];

export function useEmas(candles: Candle[]): EmaSeries[] {
  return useMemo(() => {
    return PRESET.map((p) => ({
      period: p.period,
      color: p.color,
      values: ema(candles, p.period),
    }));
  }, [candles]);
}
