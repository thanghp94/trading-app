import type { Candle, Timeframe } from '../../src/shared/types.js';

/**
 * Helpers for building synthetic candle fixtures programmatically. We could
 * hand-write JSON but generating from named patterns keeps tests readable
 * and easy to maintain when thresholds change.
 *
 * All fixtures use a 5m timeframe and start at unix-second 1_700_000_000.
 */

const START_TIME = 1_700_000_000;
const TF: Timeframe = '5m';
const STRIDE_S = 300;

interface BarSpec {
  /** Direction relative to prior close: positive = up, negative = down, 0 = doji-ish. */
  trend: number;
  /** Body size as a multiplier of the base price's "noise unit". */
  bodyMult?: number;
  /** Wick size as a multiplier. Defaults to 0.3 of body. */
  wickMult?: number;
  /** Volume multiplier vs the base 1000. Default 1. */
  volMult?: number;
  /** Override symbol. Defaults to "SYNTH". */
  symbol?: string;
}

/** Build a sequence of bars. Each bar's direction/sizes are governed by `specs`. */
export function buildCandles(specs: BarSpec[], startPrice = 100, noiseUnit = 0.5, symbol = 'SYNTH'): Candle[] {
  const candles: Candle[] = [];
  let prevClose = startPrice;
  for (let i = 0; i < specs.length; i += 1) {
    const s = specs[i];
    const bodyMult = s.bodyMult ?? 1;
    const wickMult = s.wickMult ?? 0.3;
    const open = prevClose;
    const body = s.trend * noiseUnit * bodyMult;
    const close = open + body;
    const wick = noiseUnit * wickMult;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    const volume = 1000 * (s.volMult ?? 1);
    candles.push({
      symbol: s.symbol ?? symbol,
      timeframe: TF,
      time: START_TIME + i * STRIDE_S,
      open,
      high,
      low,
      close,
      volume,
      closed: true,
    });
    prevClose = close;
  }
  return candles;
}

/** Quiet warmup: 30 small alternating bars to seed ATR, volume SMA, and the fractal detector. */
export function quietWarmup(): BarSpec[] {
  const out: BarSpec[] = [];
  for (let i = 0; i < 30; i += 1) {
    out.push({ trend: i % 2 === 0 ? 1 : -1, bodyMult: 0.4 });
  }
  return out;
}

/** A strong bull impulse bar with confirming volume — qualifies for impulse detection. */
export function bullImpulse(): BarSpec {
  return { trend: 1, bodyMult: 6, wickMult: 0.05, volMult: 3 };
}
export function bearImpulse(): BarSpec {
  return { trend: -1, bodyMult: 6, wickMult: 0.05, volMult: 3 };
}

/** A pullback leg: N small bars in `dir` direction, ending at a swing extreme. */
export function pullback(dir: -1 | 1, len: number, bodyMult = 1): BarSpec[] {
  const out: BarSpec[] = [];
  for (let i = 0; i < len; i += 1) out.push({ trend: dir, bodyMult });
  return out;
}

/** A continuation push followed by a small pullback — gives one swing pivot. */
export function pushAndPullback(dir: -1 | 1, pushLen: number, pullLen: number, bodyMult = 1.5): BarSpec[] {
  return [...pullback(dir, pushLen, bodyMult), ...pullback((-dir) as -1 | 1, pullLen, bodyMult)];
}

/** Sideways chop: alternating tiny bars that should be rejected by the min-distance filter. */
export function chop(len: number): BarSpec[] {
  const out: BarSpec[] = [];
  for (let i = 0; i < len; i += 1) out.push({ trend: i % 2 === 0 ? 1 : -1, bodyMult: 0.1 });
  return out;
}
