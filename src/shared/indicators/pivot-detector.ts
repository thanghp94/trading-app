import type { Candle } from '../types.js';
import { atr } from './atr.js';
import { volumeSma } from './impulse-detector.js';
import { VOL_SMA_PERIOD } from '../config/thresholds.js';

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
  /**
   * Composite strength score for the pivot. Encodes the teacher's manual
   * "volume arrow + sharp rejection" intuition into a single number.
   *
   *   strength = volumeFactor × moveFactor
   *
   * Where:
   *   - volumeFactor = volume[i] / SMA(volume, 20) at this bar
   *                    (fallback to range[i] / ATR(14) when volume = 0,
   *                     for forex/spot markets)
   *   - moveFactor   = subsequent move away from the pivot / ATR(14),
   *                    measured over the next 10 bars (or fewer at the
   *                    end of the series)
   *
   * Typical ranges:
   *   < 1   : weak — small move on average volume; likely noise
   *   1-3   : average — a normal swing pivot
   *   3-8   : strong — high volume + sharp rejection (the teacher's red arrow)
   *   8+    : very strong — institutional-grade rejection
   *
   * `1.0` when computation isn't possible (insufficient history etc).
   */
  strength: number;
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
  if (candles.length === 0) return pivots;
  // Pre-compute ATR + volume SMA once. Cheap, and we'd recompute anyway per pivot.
  const atrSeries = atr(candles, 14);
  const vsmaSeries = volumeSma(candles, VOL_SMA_PERIOD);

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
        strength: computeStrength(candles, i, 'high', atrSeries, vsmaSeries),
      });
    }
    if (isLow) {
      pivots.push({
        kind: 'low',
        index: i,
        time: c.time,
        wick: c.low,
        body: Math.min(c.open, c.close),
        strength: computeStrength(candles, i, 'low', atrSeries, vsmaSeries),
      });
    }
  }
  return pivots;
}

/**
 * Compute the composite strength score at pivot index `i`.
 *
 * Volume factor:
 *   - If `candles[i].volume > 0` AND volume SMA is available → vol / vsma
 *   - Otherwise (forex spot / TwelveData zero-volume) → range / ATR fallback
 *
 * Move factor: how far did price move AWAY from this pivot in the next
 * up-to-10 bars, expressed in ATR units?
 *   - For a swing-high pivot: pivot.high − min(low[i+1..i+10])
 *   - For a swing-low  pivot: max(high[i+1..i+10]) − pivot.low
 */
function computeStrength(
  candles: Candle[],
  i: number,
  kind: PivotKind,
  atrSeries: number[],
  vsmaSeries: number[],
): number {
  const c = candles[i];
  const a = atrSeries[i];
  if (!Number.isFinite(a) || a <= 0) return 1.0;

  // Volume factor with forex fallback.
  let volumeFactor = 1;
  const vsma = vsmaSeries[i];
  if (c.volume > 0 && Number.isFinite(vsma) && vsma > 0) {
    volumeFactor = c.volume / vsma;
  } else {
    const range = c.high - c.low;
    if (range > 0) volumeFactor = range / a;
  }

  // Subsequent-move factor.
  const lookAhead = Math.min(10, candles.length - 1 - i);
  let moveFactor = 0;
  if (lookAhead > 0) {
    if (kind === 'high') {
      let lowest = candles[i + 1].low;
      for (let j = i + 2; j <= i + lookAhead; j += 1) lowest = Math.min(lowest, candles[j].low);
      moveFactor = Math.max(0, (c.high - lowest) / a);
    } else {
      let highest = candles[i + 1].high;
      for (let j = i + 2; j <= i + lookAhead; j += 1) highest = Math.max(highest, candles[j].high);
      moveFactor = Math.max(0, (highest - c.low) / a);
    }
  }

  return Math.max(0.1, volumeFactor * moveFactor);
}
