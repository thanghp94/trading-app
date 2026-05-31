import type { Candle } from "../types.js";
import { rsi } from "./rsi.js";

export interface StochasticRsi {
  /** %K — smoothed StochRSI, 0..100. */
  k: number[];
  /** %D — SMA of %K. */
  d: number[];
}

/** Rolling SMA over a value series; resets across NaN gaps. */
function smaOver(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const q: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      q.length = 0;
      sum = 0;
      continue;
    }
    q.push(v);
    sum += v;
    if (q.length > period) sum -= q.shift() as number;
    if (q.length === period) out[i] = sum / period;
  }
  return out;
}

/**
 * Stochastic RSI: where RSI sits within its own recent min/max range, then
 * smoothed into %K and %D. Standard 14/14/3/3.
 */
export function stochasticRsi(
  candles: Candle[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kPeriod = 3,
  dPeriod = 3,
): StochasticRsi {
  const len = candles.length;
  const r = rsi(candles, rsiPeriod);
  const stoch = new Array<number>(len).fill(NaN);

  for (let i = 0; i < len; i += 1) {
    const start = i - stochPeriod + 1;
    if (start < 0 || !Number.isFinite(r[i]) || !Number.isFinite(r[start])) {
      continue;
    }
    let mn = Infinity;
    let mx = -Infinity;
    let ok = true;
    for (let j = start; j <= i; j += 1) {
      if (!Number.isFinite(r[j])) {
        ok = false;
        break;
      }
      if (r[j] < mn) mn = r[j];
      if (r[j] > mx) mx = r[j];
    }
    if (!ok) continue;
    stoch[i] = mx === mn ? 0 : ((r[i] - mn) / (mx - mn)) * 100;
  }

  const k = smaOver(stoch, kPeriod);
  const d = smaOver(k, dPeriod);
  return { k, d };
}
