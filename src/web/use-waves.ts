import { useMemo } from 'react';
import type { Candle } from '../shared/types.js';
import { computeWaves, type WaveCount } from '../shared/indicators/wave-counter.js';

/**
 * Derive 0-1-2-3-4-5 wave counts from the visible candle history.
 * Recomputes on every candle change. With ATR + impulse + pivot detection
 * + state walk for ~1000 bars this is well under 5ms — fine to re-run on
 * every WS tick.
 */
export function useWaves(candles: Candle[]): WaveCount[] {
  return useMemo(() => computeWaves(candles), [candles]);
}
