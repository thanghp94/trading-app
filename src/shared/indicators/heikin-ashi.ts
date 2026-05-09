import type { Candle } from '../types.js';

/**
 * Heikin-Ashi smoothing — pure transform of an OHLC candle series.
 *
 *   HA_close[i] = (open + high + low + close) / 4
 *   HA_open[i]  = (HA_open[i-1] + HA_close[i-1]) / 2  (HA_open[0] = (open + close) / 2)
 *   HA_high[i]  = max(high, HA_open[i], HA_close[i])
 *   HA_low[i]   = min(low,  HA_open[i], HA_close[i])
 *
 * Body color rule from HA values, NOT raw close-vs-open. The result is a
 * smoother trend visualization with fewer false reversals.
 */
export function heikinAshi(source: Candle[]): Candle[] {
  if (source.length === 0) return [];
  const out: Candle[] = [];
  let prevHaOpen = (source[0].open + source[0].close) / 2;
  let prevHaClose = (source[0].open + source[0].high + source[0].low + source[0].close) / 4;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? prevHaOpen : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({
      ...c,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });
    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }
  return out;
}
