import type { Candle } from '../types.js';
import {
  ALLOW_ZERO_VOLUME_CONFIRM,
  RANGE_EXPANSION_ATR,
  STRONG_BAR_BODY_ATR,
  STRONG_BAR_BODY_RANGE,
  STRONG_BAR_CLOSE_POSITION,
  VOL_MULTIPLIER,
  VOL_SMA_PERIOD,
} from '../config/thresholds.js';
import { atr } from './atr.js';

export type ImpulseDirection = 'bull' | 'bear';

export interface ImpulseHit {
  index: number;
  time: number;
  direction: ImpulseDirection;
  /** True when the volume rule fired. False when allowed by ALLOW_ZERO_VOLUME_CONFIRM. */
  volumeConfirmed: boolean;
  bodyAtrRatio: number;
  bodyRangeRatio: number;
  /** Volume / SMA(volume, N). NaN when SMA isn't available yet or volume is 0. */
  volumeRatio: number;
}

/**
 * Per-bar volume SMA. Unlike ATR this is a plain SMA — Wilder smoothing
 * isn't conventional for volume confirmation rules.
 */
export function volumeSma(candles: Candle[], period = VOL_SMA_PERIOD): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += candles[i].volume;
  out[period - 1] = sum / period;
  for (let i = period; i < candles.length; i += 1) {
    sum += candles[i].volume - candles[i - period].volume;
    out[i] = sum / period;
  }
  return out;
}

/**
 * Scan candles for impulse bars. An impulse is a single bar that satisfies
 * all four conditions:
 *   1. body / ATR(14) > STRONG_BAR_BODY_ATR
 *   2. body / range > STRONG_BAR_BODY_RANGE
 *   3. close near the appropriate extreme (top 25% bull, bottom 25% bear)
 *   4. volume > VOL_MULTIPLIER × SMA(volume, 20)
 *
 * Rule 4 is skipped when the asset reports zero volume (forex spot via
 * TwelveData, etc.) and ALLOW_ZERO_VOLUME_CONFIRM is true. The function
 * still records `volumeConfirmed = false` in that case so callers can flag
 * "rule passed by exception" if they want.
 */
export function detectImpulses(candles: Candle[]): ImpulseHit[] {
  if (candles.length < Math.max(VOL_SMA_PERIOD, 14) + 1) return [];
  const atrSeries = atr(candles, 14);
  const volSma = volumeSma(candles, VOL_SMA_PERIOD);
  const out: ImpulseHit[] = [];

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const a = atrSeries[i];
    const vsma = volSma[i];
    if (!Number.isFinite(a) || a <= 0) continue;

    const range = c.high - c.low;
    if (range <= 0) continue;
    const body = Math.abs(c.close - c.open);
    if (body <= 0) continue;

    const bodyAtr = body / a;
    const bodyRange = body / range;
    if (bodyAtr <= STRONG_BAR_BODY_ATR) continue;
    if (bodyRange <= STRONG_BAR_BODY_RANGE) continue;

    // Close position: bull = high in top 25%, bear = low in bottom 25%.
    const closePosFromLow = (c.close - c.low) / range; // 0 = at low, 1 = at high
    let direction: ImpulseDirection;
    if (c.close > c.open && closePosFromLow >= 1 - STRONG_BAR_CLOSE_POSITION) {
      direction = 'bull';
    } else if (c.close < c.open && closePosFromLow <= STRONG_BAR_CLOSE_POSITION) {
      direction = 'bear';
    } else {
      continue;
    }

    // Volume confirmation. Two paths:
    //   - Real volume available (crypto, equities) → require vol > VOL_MULTIPLIER × SMA(20)
    //   - Volume = 0 (forex spot — TwelveData/OANDA) → fall back to RANGE-EXPANSION proxy:
    //     the bar's range / ATR(14) must exceed RANGE_EXPANSION_ATR.
    //     A wide bar correlates with institutional participation even when raw
    //     volume isn't available — this is the closest stand-in for "high volume"
    //     on XAU/USD that still meaningfully filters out small-bodied chop.
    let volumeConfirmed = false;
    let volumeRatio = NaN;
    const hasVolumeData = c.volume > 0 && Number.isFinite(vsma) && vsma > 0;
    if (hasVolumeData) {
      volumeRatio = c.volume / vsma;
      volumeConfirmed = volumeRatio > VOL_MULTIPLIER;
      if (!volumeConfirmed) continue;
    } else if (ALLOW_ZERO_VOLUME_CONFIRM) {
      // Range-expansion fallback for zero-volume markets.
      const rangeRatio = range / a;
      if (rangeRatio <= RANGE_EXPANSION_ATR) continue;
      // Treat as "confirmed" via the proxy; volumeRatio stays NaN to signal
      // "real volume not available, range-expansion proxy fired".
    } else {
      continue;
    }

    out.push({
      index: i,
      time: c.time,
      direction,
      volumeConfirmed,
      bodyAtrRatio: bodyAtr,
      bodyRangeRatio: bodyRange,
      volumeRatio,
    });
  }
  return out;
}
