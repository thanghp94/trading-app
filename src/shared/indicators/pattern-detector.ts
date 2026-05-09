import type { Candle } from '../types.js';
import { atr } from './atr.js';
import { detectPivots, type Pivot } from './pivot-detector.js';

export type PatternKind =
  | 'double-top'
  | 'double-bottom'
  | 'head-and-shoulders'
  | 'inverse-head-and-shoulders';

export interface DetectedPattern {
  kind: PatternKind;
  /** Pivots that compose the pattern, in chronological order. */
  pivots: Pivot[];
  /** Confidence score 0..1 (heuristic). */
  confidence: number;
  /** Bar time of the latest pivot in the pattern. */
  formedAt: number;
  /** "Neckline" or comparable invalidation level (close beyond → pattern breaks). */
  neckline: number;
}

interface DetectOpts {
  pivotN?: number;
  /** Tolerance for "equal" peaks/troughs in ATR units. Default 0.5. */
  similarityAtr?: number;
  /** How far back (in pivots) to scan. Default 12 most recent. */
  lookbackPivots?: number;
}

/**
 * Heuristic detector for the most common reversal patterns. All detection
 * is post-hoc — patterns "form" only after their confirming pivot is
 * fractal-confirmed (5-bar lag), same as the wave counter.
 *
 * Patterns:
 *
 *   DOUBLE TOP          DOUBLE BOTTOM       HEAD & SHOULDERS    INVERSE H&S
 *      A     B            ___A__ neckline      A  C                 ___A___C__
 *     /\    /\               \   /\          / \  /\               \  / \  /
 *    /  \  /  \               \ /  \        / B \/  \               \/ B \/
 *   /    \/    \  neckline    A    B        ----neckline-----      A    head?C
 *  /     C      \                            head=B               (mirror)
 *
 * Designed conservatively — false positives from chop are filtered by
 * requiring meaningful spacing and similar-but-not-identical extremes.
 */
export function detectPatterns(candles: Candle[], opts: DetectOpts = {}): DetectedPattern[] {
  const { pivotN = 2, similarityAtr = 0.5, lookbackPivots = 12 } = opts;
  if (candles.length < 30) return [];

  const atrSeries = atr(candles, 14);
  const pivots = detectPivots(candles, pivotN).slice(-lookbackPivots);
  if (pivots.length < 4) return [];

  const out: DetectedPattern[] = [];
  const tolAt = (idx: number) => {
    const a = atrSeries[idx];
    return Number.isFinite(a) && a > 0 ? a * similarityAtr : 0;
  };

  // Double tops: two consecutive HIGH pivots with similar wicks, separated by a LOW.
  for (let i = 2; i < pivots.length; i += 1) {
    const c = pivots[i];
    const b = pivots[i - 1];
    const a = pivots[i - 2];
    if (a.kind !== 'high' || b.kind !== 'low' || c.kind !== 'high') continue;
    const tol = tolAt(c.index);
    if (Math.abs(c.wick - a.wick) > tol) continue;
    if (b.wick >= Math.min(a.wick, c.wick) - tol) continue; // need a real trough between
    out.push({
      kind: 'double-top',
      pivots: [a, b, c],
      confidence: confidenceFromGap(c.wick, a.wick, tol),
      formedAt: c.time,
      neckline: b.wick,
    });
  }

  // Double bottoms: mirror of above.
  for (let i = 2; i < pivots.length; i += 1) {
    const c = pivots[i];
    const b = pivots[i - 1];
    const a = pivots[i - 2];
    if (a.kind !== 'low' || b.kind !== 'high' || c.kind !== 'low') continue;
    const tol = tolAt(c.index);
    if (Math.abs(c.wick - a.wick) > tol) continue;
    if (b.wick <= Math.max(a.wick, c.wick) + tol) continue;
    out.push({
      kind: 'double-bottom',
      pivots: [a, b, c],
      confidence: confidenceFromGap(c.wick, a.wick, tol),
      formedAt: c.time,
      neckline: b.wick,
    });
  }

  // Head & Shoulders: HIGH-LOW-HIGH(higher)-LOW-HIGH (similar to first), and the two
  // troughs at similar height (the neckline).
  for (let i = 4; i < pivots.length; i += 1) {
    const e = pivots[i];     // right shoulder
    const d = pivots[i - 1]; // right trough
    const c = pivots[i - 2]; // head
    const b = pivots[i - 3]; // left trough
    const a = pivots[i - 4]; // left shoulder
    if (a.kind !== 'high' || b.kind !== 'low' || c.kind !== 'high' || d.kind !== 'low' || e.kind !== 'high') continue;
    const tol = tolAt(e.index);
    if (c.wick <= Math.max(a.wick, e.wick) + tol) continue; // head must be highest
    if (Math.abs(a.wick - e.wick) > tol * 2) continue; // shoulders similar (looser)
    if (Math.abs(b.wick - d.wick) > tol * 1.5) continue; // troughs similar (neckline)
    out.push({
      kind: 'head-and-shoulders',
      pivots: [a, b, c, d, e],
      confidence: confidenceFromGap(a.wick, e.wick, tol * 2),
      formedAt: e.time,
      neckline: (b.wick + d.wick) / 2,
    });
  }

  // Inverse H&S — mirror.
  for (let i = 4; i < pivots.length; i += 1) {
    const e = pivots[i];
    const d = pivots[i - 1];
    const c = pivots[i - 2];
    const b = pivots[i - 3];
    const a = pivots[i - 4];
    if (a.kind !== 'low' || b.kind !== 'high' || c.kind !== 'low' || d.kind !== 'high' || e.kind !== 'low') continue;
    const tol = tolAt(e.index);
    if (c.wick >= Math.min(a.wick, e.wick) - tol) continue;
    if (Math.abs(a.wick - e.wick) > tol * 2) continue;
    if (Math.abs(b.wick - d.wick) > tol * 1.5) continue;
    out.push({
      kind: 'inverse-head-and-shoulders',
      pivots: [a, b, c, d, e],
      confidence: confidenceFromGap(a.wick, e.wick, tol * 2),
      formedAt: e.time,
      neckline: (b.wick + d.wick) / 2,
    });
  }

  return out;
}

/** Confidence is higher when the two reference pivots are closer (within tolerance). */
function confidenceFromGap(a: number, b: number, tol: number): number {
  if (tol <= 0) return 0.5;
  const gap = Math.abs(a - b);
  return Math.max(0, Math.min(1, 1 - gap / tol));
}
