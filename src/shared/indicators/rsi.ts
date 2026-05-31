import type { Candle } from "../types.js";

/** RSI using Wilder's smoothing (standard). Returns NaN for first `period` bars. */
export function rsi(candles: Candle[], period = 14): number[] {
  const len = candles.length;
  const result: number[] = new Array(len).fill(NaN);
  if (len < period + 1) return result;

  // First average gain/loss over initial period
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = candles[i].close - candles[i - 1].close;
    if (delta > 0) avgGain += delta;
    else avgLoss += -delta;
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) result[period] = 100;
  else result[period] = 100 - 100 / (1 + avgGain / avgLoss);

  // Wilder smoothing for remaining bars
  for (let i = period + 1; i < len; i++) {
    const delta = candles[i].close - candles[i - 1].close;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) result[i] = 100;
    else result[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}
