import type { Candle, Timeframe, Zone } from '../types.js';
import { ema } from './ema.js';
import { computeZones } from './sr-zone-tracker.js';
import { resample } from './resample.js';

export type MtfStatus = 'aligned' | 'mismatch' | 'no-data';

export interface MtfCheck {
  /** Trend status: 'aligned' = HTF agrees with the LTF direction, 'mismatch' = disagrees, 'no-data' = HTF too short. */
  trend: MtfStatus;
  /** Zone confluence: 'aligned' = entry price within an active HTF zone in trade direction, else 'mismatch'. */
  zone: MtfStatus;
  /** The HTF used for the check (e.g. '4h'). null if no higher TF available. */
  htf: Timeframe | null;
  /** HTF EMA(50) value at entry — for transparency. */
  htfEma50?: number;
  /** Active HTF zone (if any) the entry sits inside. */
  htfZone?: Zone | null;
}

/**
 * Map each base timeframe to a meaningful "higher timeframe" for context.
 * Aligned with the HTF zone overlay used in the chart UI.
 */
export const HTF_FOR: Partial<Record<Timeframe, Timeframe>> = {
  '1m': '1h',
  '5m': '4h',
  '15m': '4h',
  '1h': '1d',
  '4h': '1d',
};

/**
 * Multi-timeframe alignment check at a given (entryIdx, direction).
 *
 * Two independent signals:
 *   - **Trend alignment** via HTF EMA(50): entry price > HTF EMA50 for bull,
 *     < for bear. Encodes "trade with the higher-TF trend."
 *   - **Zone confluence**: entry price falls inside an active HTF S/R zone
 *     in the trade direction (support for bull entry, resistance for bear).
 *     Encodes "look for HTF context behind the LTF setup."
 *
 * Returns 'no-data' when there's not enough HTF history (e.g. 5m base with
 * < 50 4h-bars worth of history).
 */
export function checkMtf(opts: {
  baseCandles: Candle[];
  baseTf: Timeframe;
  entryIdx: number;
  direction: 'bull' | 'bear';
}): MtfCheck {
  const htf = HTF_FOR[opts.baseTf] ?? null;
  if (!htf) return { trend: 'no-data', zone: 'no-data', htf: null };
  if (opts.entryIdx < 0 || opts.entryIdx >= opts.baseCandles.length) {
    return { trend: 'no-data', zone: 'no-data', htf };
  }

  // Resample only the candles up to and including the entry bar — no peeking ahead.
  const sliceUpToEntry = opts.baseCandles.slice(0, opts.entryIdx + 1);
  let htfCandles: Candle[] = [];
  try {
    htfCandles = resample(sliceUpToEntry, htf);
  } catch {
    return { trend: 'no-data', zone: 'no-data', htf };
  }
  if (htfCandles.length < 55) {
    return { trend: 'no-data', zone: 'no-data', htf };
  }

  const entry = opts.baseCandles[opts.entryIdx].close;

  // Trend via EMA(50)
  const emaSeries = ema(htfCandles, 50);
  const lastEma = emaSeries[emaSeries.length - 1];
  let trend: MtfStatus = 'no-data';
  let htfEma50: number | undefined;
  if (Number.isFinite(lastEma) && lastEma > 0) {
    htfEma50 = lastEma;
    if (opts.direction === 'bull') trend = entry > lastEma ? 'aligned' : 'mismatch';
    else trend = entry < lastEma ? 'aligned' : 'mismatch';
  }

  // Zone confluence — does entry sit inside an active HTF zone in the trade direction?
  const htfZones = computeZones(htfCandles);
  let zone: MtfStatus = 'mismatch';
  let htfZone: Zone | null = null;
  for (const z of htfZones) {
    if (z.state !== 'active') continue;
    const inside = entry >= z.bottom && entry <= z.top;
    if (!inside) continue;
    const directionMatch =
      (opts.direction === 'bull' && z.type === 'support') ||
      (opts.direction === 'bear' && z.type === 'resistance');
    if (directionMatch) {
      zone = 'aligned';
      htfZone = z;
      break;
    }
  }

  return { trend, zone, htf, htfEma50, htfZone };
}
