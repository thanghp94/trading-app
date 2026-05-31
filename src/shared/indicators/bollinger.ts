import type { Candle } from "../types.js";

export interface BollingerBands {
  upper: number[];
  middle: number[];
  lower: number[];
}

/** Bollinger Bands: middle = SMA(period), upper/lower = middle ± mult * stddev. */
export function bollinger(
  candles: Candle[],
  period = 20,
  mult = 2,
): BollingerBands {
  const len = candles.length;
  const middle: number[] = new Array(len).fill(NaN);
  const upper: number[] = new Array(len).fill(NaN);
  const lower: number[] = new Array(len).fill(NaN);

  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const sma = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = candles[j].close - sma;
      variance += diff * diff;
    }
    const sd = Math.sqrt(variance / period);

    middle[i] = sma;
    upper[i] = sma + mult * sd;
    lower[i] = sma - mult * sd;
  }

  return { upper, middle, lower };
}
