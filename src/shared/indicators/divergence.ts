import type { Candle } from "../types.js";
import { detectPivots } from "./pivot-detector.js";
import { rsi } from "./rsi.js";

/** Phân kỳ — regular (đảo chiều) and hidden (ẩn, tiếp diễn) RSI divergence. */
export type Divergence =
  | "bullish"
  | "bearish"
  | "hidden-bullish"
  | "hidden-bearish"
  | "none";

const RECENT_BARS = 5;

/**
 * Detect RSI divergence at the latest swing.
 *   regular bullish : price lower low,  RSI higher low   (đảo chiều tăng)
 *   hidden bullish  : price higher low, RSI lower low    (tiếp diễn tăng — ẩn)
 *   regular bearish : price higher high, RSI lower high  (đảo chiều giảm)
 *   hidden bearish  : price lower high,  RSI higher high (tiếp diễn giảm — ẩn)
 * Only reported when the latest pivot is recent. Bullish family takes priority.
 */
export function detectDivergence(candles: Candle[], pivotN = 2): Divergence {
  if (candles.length < 40) return "none";
  const r = rsi(candles, 14);
  const pivots = detectPivots(candles, pivotN);
  const lastIdx = candles.length - 1;
  const recent = (i: number) => lastIdx - i <= RECENT_BARS + pivotN;

  const lows = pivots.filter(
    (p) => p.kind === "low" && Number.isFinite(r[p.index]),
  );
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2); // a older, b newer
    if (recent(b.index)) {
      if (b.wick < a.wick && r[b.index] > r[a.index]) return "bullish";
      if (b.wick > a.wick && r[b.index] < r[a.index]) return "hidden-bullish";
    }
  }

  const highs = pivots.filter(
    (p) => p.kind === "high" && Number.isFinite(r[p.index]),
  );
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (recent(b.index)) {
      if (b.wick > a.wick && r[b.index] < r[a.index]) return "bearish";
      if (b.wick < a.wick && r[b.index] > r[a.index]) return "hidden-bearish";
    }
  }
  return "none";
}
