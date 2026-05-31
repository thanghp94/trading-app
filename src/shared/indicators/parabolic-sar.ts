import type { Candle } from "../types.js";

export interface ParabolicSar {
  /** SAR price per bar. */
  sar: number[];
  /** Trend the SAR is currently following (below price = up, above = down). */
  trend: Array<"up" | "down">;
}

/**
 * Wilder's Parabolic SAR. `step` = acceleration factor increment (0.02),
 * `max` = AF ceiling (0.2). Trend flips when price penetrates the SAR; on flip
 * the SAR resets to the prior extreme point and AF resets to `step`.
 */
export function parabolicSar(
  candles: Candle[],
  step = 0.02,
  max = 0.2,
): ParabolicSar {
  const len = candles.length;
  const sar = new Array<number>(len).fill(NaN);
  const trend = new Array<"up" | "down">(len).fill("up");
  if (len < 2) return { sar, trend };

  let up = candles[1].close >= candles[0].close;
  let af = step;
  let ep = up ? candles[0].high : candles[0].low;
  let prevSar = up ? candles[0].low : candles[0].high;
  sar[0] = prevSar;
  trend[0] = up ? "up" : "down";

  for (let i = 1; i < len; i += 1) {
    const c = candles[i];
    let cur = prevSar + af * (ep - prevSar);

    if (up) {
      // SAR must not rise above the prior two lows.
      const lo1 = candles[i - 1].low;
      const lo2 = i >= 2 ? candles[i - 2].low : lo1;
      cur = Math.min(cur, lo1, lo2);
      if (c.high > ep) {
        ep = c.high;
        af = Math.min(af + step, max);
      }
      if (c.low < cur) {
        up = false;
        cur = ep;
        ep = c.low;
        af = step;
      }
    } else {
      const hi1 = candles[i - 1].high;
      const hi2 = i >= 2 ? candles[i - 2].high : hi1;
      cur = Math.max(cur, hi1, hi2);
      if (c.low < ep) {
        ep = c.low;
        af = Math.min(af + step, max);
      }
      if (c.high > cur) {
        up = true;
        cur = ep;
        ep = c.high;
        af = step;
      }
    }

    sar[i] = cur;
    trend[i] = up ? "up" : "down";
    prevSar = cur;
  }

  return { sar, trend };
}
