import { useMemo } from "react";
import type { Candle } from "../shared/types.js";
import {
  bollinger,
  type BollingerBands,
} from "../shared/indicators/bollinger.js";

export type { BollingerBands };

export function useBollinger(
  candles: Candle[],
  period = 20,
  mult = 2,
): BollingerBands {
  return useMemo(
    () => bollinger(candles, period, mult),
    [candles, period, mult],
  );
}
