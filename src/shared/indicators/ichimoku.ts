import type { Candle } from "../types.js";

export interface IchimokuSeries {
  tenkan: number[];
  kijun: number[];
  senkouA: number[];
  senkouB: number[];
}

export type IchimokuSignal = "good" | "bad" | "neutral";

function midOverWindow(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    out[i] = (hi + lo) / 2;
  }
  return out;
}

/** Ichimoku lines (Tenkan 9 / Kijun 26 / Senkou A / Senkou B 52). Not displaced. */
export function ichimoku(
  candles: Candle[],
  conv = 9,
  base = 26,
  spanB = 52,
): IchimokuSeries {
  const tenkan = midOverWindow(candles, conv);
  const kijun = midOverWindow(candles, base);
  const senkouA = tenkan.map((t, i) =>
    Number.isFinite(t) && Number.isFinite(kijun[i]) ? (t + kijun[i]) / 2 : NaN,
  );
  const senkouB = midOverWindow(candles, spanB);
  return { tenkan, kijun, senkouA, senkouB };
}

/**
 * Classify the latest bar: "good" (bullish cloud structure), "bad" (bearish),
 * or "neutral". The cloud at the current bar is the Senkou pair from `base`
 * bars ago (the forward-displacement, read backwards). Bullish = price above a
 * green cloud with Tenkan > Kijun; bearish = mirror.
 */
export function ichimokuSignal(candles: Candle[], base = 26): IchimokuSignal {
  if (candles.length < 52 + base) return "neutral";
  const { tenkan, kijun, senkouA, senkouB } = ichimoku(candles);
  const i = candles.length - 1;
  const close = candles[i].close;
  const a = senkouA[i - base];
  const b = senkouB[i - base];
  if (![tenkan[i], kijun[i], a, b].every(Number.isFinite)) return "neutral";

  const cloudTop = Math.max(a, b);
  const cloudBottom = Math.min(a, b);
  const greenCloud = a > b;

  if (close > cloudTop && tenkan[i] > kijun[i] && greenCloud) return "good";
  if (close < cloudBottom && tenkan[i] < kijun[i] && !greenCloud) return "bad";
  return "neutral";
}
