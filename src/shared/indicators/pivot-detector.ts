import type { Candle } from '../types.js';

export type PivotKind = 'high' | 'low';

export interface Pivot {
  kind: PivotKind;
  /** Index into the candles array. */
  index: number;
  /** Bar open time (unix sec). */
  time: number;
  /**
   * The wick extreme — `high` for swing-high pivots, `low` for swing-low pivots.
   * (Râu nến — zone is anchored to the wick, not the body.)
   */
  wick: number;
  /**
   * The opposite body edge — for a swing high this is `max(open, close)`,
   * for a swing low this is `min(open, close)`. Used as the inner edge of
   * the zone rectangle (the rejection box).
   */
  body: number;
}

/**
 * N-bar fractal swing detection. A bar at index `i` is a swing HIGH when its
 * `high` is strictly greater than the highs of `N` bars on each side. Swing
 * LOW is the mirror condition on `low`. Default N=2 → 5-bar fractal (the
 * classic "Bill Williams" pattern).
 *
 * Pivots are confirmed `N` bars after they form — accept this lag for live
 * use; never relabel a confirmed pivot.
 */
export function detectPivots(candles: Candle[], n = 2): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = n; i < candles.length - n; i += 1) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= n; j += 1) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isHigh = false;
      if (candles[i - j].low <= c.low || candles[i + j].low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) {
      pivots.push({
        kind: 'high',
        index: i,
        time: c.time,
        wick: c.high,
        body: Math.max(c.open, c.close),
      });
    }
    if (isLow) {
      pivots.push({
        kind: 'low',
        index: i,
        time: c.time,
        wick: c.low,
        body: Math.min(c.open, c.close),
      });
    }
  }
  return pivots;
}
