import type { Candle } from '../types.js';
import {
  MAX_WAVE_POINT,
  MIN_PIVOT_DISTANCE_ATR,
  PIVOT_FRACTAL_N,
  RESET_NO_PIVOT_BARS,
  RESET_REJECTED_PIVOTS,
} from '../config/thresholds.js';
import { atr } from './atr.js';
import { detectPivots, type Pivot } from './pivot-detector.js';
import { detectImpulses, type ImpulseDirection, type ImpulseHit } from './impulse-detector.js';

export type WavePointLabel = 0 | 1 | 2 | 3 | 4 | 5;

export interface WavePoint {
  label: WavePointLabel;
  /** Bar index in the source candle array. */
  index: number;
  time: number;
  /** Price at the wave point — close for label 0 (impulse close), wick for labels 1-5 (pivot extreme). */
  price: number;
}

export type WaveResetReason = 'beyond-0' | 'no-pivot-timeout' | 'chop-rejected' | 'completed';

export interface WaveCount {
  id: string;
  direction: ImpulseDirection;
  /** Index of the impulse bar (point 0). */
  startIndex: number;
  startTime: number;
  /** Confirmed wave points 0..5. Always starts with label 0. */
  points: WavePoint[];
  /** True while we're still waiting for more pivots. False once reset or completed. */
  active: boolean;
  /** Why we stopped waiting. Undefined while still active. */
  resetReason?: WaveResetReason;
  /** Timestamp when the count finalized (reset or completed). Undefined while active. */
  endedAt?: number;
}

interface BuildOpts {
  pivotN?: number;
  atrPeriod?: number;
}

/**
 * Pure function: take a candle history, return all wave counts found.
 *
 * Algorithm in plain English:
 *   1. Detect impulse bars (strong body + volume + close-near-extreme).
 *   2. For each impulse, walk forward through subsequent bars looking for
 *      confirmed N-bar fractal pivots in the alternating direction.
 *   3. A new pivot is accepted only if it sits at least MIN_PIVOT_DISTANCE_ATR
 *      away from the previous wave point. Closer pivots are noise — they
 *      get rejected and counted toward the chop limit.
 *   4. If price closes beyond point 0 in the wrong direction, abort the count.
 *   5. If too many bars pass with no new pivot, abort.
 *   6. If too many pivots are rejected as too-close, abort (regime is chop).
 *   7. When we've collected all six points (0..5), the count is complete.
 *
 * Wave numbering for a BULL impulse:
 *   0 = impulse bar (close)
 *   1 = first pullback low
 *   2 = next swing high
 *   3 = next pullback low
 *   4 = next swing high
 *   5 = next pullback low
 * Mirror for BEAR.
 *
 * Two impulses overlapping are handled: when a new impulse fires while a
 * prior count is still active, the prior count is left alone (it can still
 * complete or reset on its own merits) and a new count is started.
 */
export function computeWaves(candles: Candle[], opts: BuildOpts = {}): WaveCount[] {
  const pivotN = opts.pivotN ?? PIVOT_FRACTAL_N;
  if (candles.length < 30) return [];
  const atrSeries = atr(candles, opts.atrPeriod ?? 14);
  const impulses = detectImpulses(candles);
  if (impulses.length === 0) return [];

  // Pre-compute all confirmed pivots so each wave count can scan a small index.
  const allPivots = detectPivots(candles, pivotN);
  const pivotByIndex = new Map<number, Pivot>();
  for (const p of allPivots) pivotByIndex.set(p.index, p);

  const counts: WaveCount[] = [];

  for (const imp of impulses) {
    counts.push(buildOneWaveCount(candles, atrSeries, pivotByIndex, imp, pivotN));
  }
  return counts;
}

function buildOneWaveCount(
  candles: Candle[],
  atrSeries: number[],
  pivotByIndex: Map<number, Pivot>,
  imp: ImpulseHit,
  pivotN: number,
): WaveCount {
  const impulseBar = candles[imp.index];
  const point0: WavePoint = { label: 0, index: imp.index, time: imp.time, price: impulseBar.close };

  const count: WaveCount = {
    id: `w${imp.index}_${imp.time}`,
    direction: imp.direction,
    startIndex: imp.index,
    startTime: imp.time,
    points: [point0],
    active: true,
  };

  // Expected pivot kind alternates. For BULL: pivots after 0 are LOW (1), HIGH (2), LOW (3), …
  // For BEAR: HIGH (1), LOW (2), HIGH (3), …
  const expectedKindFor = (label: WavePointLabel): 'high' | 'low' => {
    if (imp.direction === 'bull') return label % 2 === 1 ? 'low' : 'high';
    return label % 2 === 1 ? 'high' : 'low';
  };

  let rejectedStreak = 0;
  let lastPivotIndex = imp.index;

  for (let i = imp.index + 1; i < candles.length; i += 1) {
    const c = candles[i];
    const lastPoint = count.points[count.points.length - 1];

    // Reset 1 — close beyond point 0 against direction.
    if (imp.direction === 'bull' && c.close < point0.price) {
      count.active = false;
      count.resetReason = 'beyond-0';
      count.endedAt = c.time;
      return count;
    }
    if (imp.direction === 'bear' && c.close > point0.price) {
      count.active = false;
      count.resetReason = 'beyond-0';
      count.endedAt = c.time;
      return count;
    }

    // Reset 2 — too long with no new pivot. Measured from the last accepted pivot.
    if (i - lastPivotIndex >= RESET_NO_PIVOT_BARS) {
      count.active = false;
      count.resetReason = 'no-pivot-timeout';
      count.endedAt = c.time;
      return count;
    }

    // Reset 3 — too many close-pivot rejections in a row (chop).
    if (rejectedStreak >= RESET_REJECTED_PIVOTS) {
      count.active = false;
      count.resetReason = 'chop-rejected';
      count.endedAt = c.time;
      return count;
    }

    // Look for a confirmed pivot at index `i - pivotN` (5-bar fractal lag).
    const pivotConfirmIndex = i - pivotN;
    if (pivotConfirmIndex <= imp.index) continue;
    const pivot = pivotByIndex.get(pivotConfirmIndex);
    if (!pivot) continue;

    const nextLabel = (lastPoint.label + 1) as WavePointLabel;
    const expectKind = expectedKindFor(nextLabel);
    if (pivot.kind !== expectKind) continue;

    // Min-distance check.
    const a = atrSeries[pivot.index];
    const minDist = (Number.isFinite(a) && a > 0 ? a : 0) * MIN_PIVOT_DISTANCE_ATR;
    const dist = Math.abs(pivot.wick - lastPoint.price);
    if (dist < minDist) {
      rejectedStreak += 1;
      continue;
    }

    // Accept the pivot.
    rejectedStreak = 0;
    lastPivotIndex = pivot.index;
    count.points.push({
      label: nextLabel,
      index: pivot.index,
      time: pivot.time,
      price: pivot.wick,
    });

    if (nextLabel === MAX_WAVE_POINT) {
      count.active = false;
      count.resetReason = 'completed';
      count.endedAt = c.time;
      return count;
    }
  }

  // Walked off the end of the candle array — count is still in-progress.
  return count;
}
