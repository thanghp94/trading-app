import type { Candle } from '../types.js';

/**
 * Wilder's ATR. First N values are SMA-of-TR; subsequent values use the
 * smoothing recursion ATR_t = (ATR_{t-1} * (N-1) + TR_t) / N.
 *
 * Returns one ATR per candle aligned by index. The first (N-1) entries are
 * NaN (insufficient history).
 */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length === 0) return out;

  const trs: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr =
      i === 0
        ? c.high - c.low
        : Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    trs.push(tr);
  }

  if (candles.length < period) return out;

  // SMA of first `period` TRs.
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += trs[i];
  let prevAtr = sum / period;
  out[period - 1] = prevAtr;

  for (let i = period; i < candles.length; i += 1) {
    const next = (prevAtr * (period - 1) + trs[i]) / period;
    out[i] = next;
    prevAtr = next;
  }
  return out;
}
