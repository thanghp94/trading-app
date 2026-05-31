import type { Candle } from "../types.js";

export interface Macd {
  /** EMA(fast) − EMA(slow). */
  macd: number[];
  /** EMA(macd, signalPeriod). */
  signal: number[];
  /** macd − signal. */
  histogram: number[];
}

/**
 * EMA over a raw value series (not candles). Seeds with the SMA of the first
 * `period` finite values, matching ema.ts. Leading NaN inputs are skipped so a
 * series like the MACD line (NaN until both EMAs warm up) seeds correctly.
 */
function emaOverValues(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  let count = 0;
  let sum = 0;
  let seeded = false;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      count = 0;
      sum = 0;
      seeded = false;
      continue;
    }
    if (!seeded) {
      count += 1;
      sum += v;
      if (count === period) {
        prev = sum / period;
        out[i] = prev;
        seeded = true;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** MACD (Moving Average Convergence Divergence). Standard 12/26/9. */
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): Macd {
  const len = candles.length;
  const closes = candles.map((c) => c.close);
  const emaFast = emaOverValues(closes, fast);
  const emaSlow = emaOverValues(closes, slow);

  const macdLine = new Array<number>(len).fill(NaN);
  for (let i = 0; i < len; i += 1) {
    if (Number.isFinite(emaFast[i]) && Number.isFinite(emaSlow[i])) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  const signal = emaOverValues(macdLine, signalPeriod);
  const histogram = new Array<number>(len).fill(NaN);
  for (let i = 0; i < len; i += 1) {
    if (Number.isFinite(macdLine[i]) && Number.isFinite(signal[i])) {
      histogram[i] = macdLine[i] - signal[i];
    }
  }

  return { macd: macdLine, signal, histogram };
}
