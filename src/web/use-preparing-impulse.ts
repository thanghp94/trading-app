import { useMemo } from 'react';
import type { Candle } from '../shared/types.js';
import { atr } from '../shared/indicators/atr.js';
import { volumeSma } from '../shared/indicators/impulse-detector.js';
import {
  ALLOW_ZERO_VOLUME_CONFIRM,
  STRONG_BAR_BODY_ATR,
  STRONG_BAR_BODY_RANGE,
  STRONG_BAR_CLOSE_POSITION,
  VOL_MULTIPLIER,
  VOL_SMA_PERIOD,
} from '../shared/config/thresholds.js';

export interface PreparingState {
  /** True when the still-forming bar passes impulse criteria right now. */
  preparing: boolean;
  /** Bull / bear bias of the forming impulse, or null. */
  direction: 'bull' | 'bear' | null;
  /** Body / ATR ratio at this moment. */
  bodyAtr: number;
  /** Volume / SMA ratio at this moment, or NaN if no volume data. */
  volumeRatio: number;
}

/**
 * Watch the LIVE (un-closed) candle and detect if it currently passes the
 * same impulse criteria the alert engine uses for closed bars.
 *
 * Encodes the teacher's "có xác nhận mới trade" rule: prepare while the
 * bar forms, but only ACT once it closes. This hook drives a yellow
 * ⚠ Preparing badge on each chart cell — visible while the live bar
 * looks strong, gone the instant it closes (or backs off the criteria).
 *
 * Pure derivation — no side effects, no broadcasts. Each cell evaluates
 * its own live bar locally.
 */
export function usePreparingImpulse(candles: Candle[]): PreparingState {
  return useMemo(() => {
    const empty: PreparingState = { preparing: false, direction: null, bodyAtr: 0, volumeRatio: NaN };
    if (candles.length < Math.max(VOL_SMA_PERIOD, 14) + 1) return empty;
    const last = candles[candles.length - 1];
    if (last.closed) return empty; // closed bars are handled by the real impulse detector

    const a = atr(candles, 14)[candles.length - 1];
    if (!Number.isFinite(a) || a <= 0) return empty;

    const range = last.high - last.low;
    if (range <= 0) return empty;
    const body = Math.abs(last.close - last.open);
    if (body <= 0) return empty;

    const bodyAtr = body / a;
    const bodyRange = body / range;
    if (bodyAtr <= STRONG_BAR_BODY_ATR) return { ...empty, bodyAtr };
    if (bodyRange <= STRONG_BAR_BODY_RANGE) return { ...empty, bodyAtr };

    const closePosFromLow = (last.close - last.low) / range;
    let direction: 'bull' | 'bear' | null = null;
    if (last.close > last.open && closePosFromLow >= 1 - STRONG_BAR_CLOSE_POSITION) {
      direction = 'bull';
    } else if (last.close < last.open && closePosFromLow <= STRONG_BAR_CLOSE_POSITION) {
      direction = 'bear';
    }
    if (!direction) return { ...empty, bodyAtr };

    // Volume confirmation against the SMA up to (but not including) the live bar.
    const closedHistory = candles.slice(0, -1);
    const vsma = volumeSma(closedHistory, VOL_SMA_PERIOD);
    const lastVsma = vsma[vsma.length - 1];
    let volumeRatio = NaN;
    let volumeConfirmed = false;
    if (last.volume > 0 && Number.isFinite(lastVsma) && lastVsma > 0) {
      volumeRatio = last.volume / lastVsma;
      volumeConfirmed = volumeRatio > VOL_MULTIPLIER;
    } else if (ALLOW_ZERO_VOLUME_CONFIRM) {
      volumeConfirmed = true;
    }
    if (!volumeConfirmed) return { preparing: false, direction, bodyAtr, volumeRatio };

    return { preparing: true, direction, bodyAtr, volumeRatio };
  }, [candles]);
}
