import { useMemo } from "react";
import type { Candle } from "../shared/types.js";
import { rsi } from "../shared/indicators/rsi.js";

export function useRsi(candles: Candle[], period = 14): number[] {
  return useMemo(() => rsi(candles, period), [candles, period]);
}
