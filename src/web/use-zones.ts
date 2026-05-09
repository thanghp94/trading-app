import { useMemo } from 'react';
import type { Candle, Zone } from '../shared/types.js';
import { computeZones } from '../shared/indicators/sr-zone-tracker.js';

/**
 * Derive S/R zones from the visible candle history.
 *
 * Recomputed whenever the candle array reference changes (every tick).
 * Pivot detection is O(N), zone clustering O(N log N), state walk O(N×Z) —
 * for ~100 bars and ~10 zones this is sub-millisecond. We can move to an
 * incremental streaming algorithm if perf becomes an issue.
 */
export function useZones(candles: Candle[]): Zone[] {
  return useMemo(() => computeZones(candles), [candles]);
}
