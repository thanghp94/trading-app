import { useMemo } from 'react';
import type { Candle, Timeframe, Zone } from '../shared/types.js';
import { resample, tfSeconds } from '../shared/indicators/resample.js';
import { computeZones } from '../shared/indicators/sr-zone-tracker.js';

const HTF_FOR: Partial<Record<Timeframe, Timeframe>> = {
  '1m': '1h',
  '5m': '4h',
  '15m': '4h',
  '1h': '1d',
  '4h': '1d',
};

/**
 * Compute zones at a higher timeframe and return them tagged for chart
 * rendering on the lower timeframe. For example, on a 5m chart you'll see
 * H4 zones overlaid — the same zones a swing trader would draw on the
 * higher timeframe to give context to the LTF setup.
 *
 * No HTF available for `1d` (already top of stack).
 */
export function useHtfZones(candles: Candle[], baseTf: Timeframe): Zone[] {
  return useMemo(() => {
    const targetTf = HTF_FOR[baseTf];
    if (!targetTf) return [];
    if (candles.length === 0) return [];
    // Skip when the HTF would have less than ~50 bars from the resampled history.
    const span = candles.length * tfSeconds(baseTf);
    const htfBars = span / tfSeconds(targetTf);
    if (htfBars < 50) return [];
    try {
      const htfCandles = resample(candles, targetTf);
      const zones = computeZones(htfCandles);
      // Tag IDs so the chart renders these distinctly from native zones.
      return zones.map((z) => ({ ...z, id: `htf-${z.id}` }));
    } catch {
      return [];
    }
  }, [candles, baseTf]);
}
