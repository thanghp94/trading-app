import type { Candle } from '../types.js';

/**
 * Exponential moving average using the standard recurrence:
 *   EMA[0]   = SMA of the first `period` closes
 *   EMA[t]   = close[t] * k + EMA[t-1] * (1 - k),  k = 2 / (period + 1)
 *
 * Returns one value per candle aligned by index. The first (period - 1)
 * entries are NaN (insufficient history).
 */
export function ema(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += candles[i].close;
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < candles.length; i += 1) {
    prev = candles[i].close * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
