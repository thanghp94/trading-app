import type { Candle, Timeframe } from '../../shared/types.js';
import { computeZones } from '../../shared/indicators/sr-zone-tracker.js';
import { computeWaves } from '../../shared/indicators/wave-counter.js';
import { detectImpulses } from '../../shared/indicators/impulse-detector.js';

export interface ScannerEntry {
  symbol: string;
  timeframe: Timeframe;
  /** Composite score (higher = better setup right now). */
  score: number;
  /** Human-readable bullets for why this symbol scored well. */
  reasons: string[];
  lastClose: number;
  lastTime: number;
}

interface ScanInputs {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
}

/**
 * Score one (symbol, timeframe). Heuristic combination of:
 *   - active wave count present and at point 1, 2, 3, or 4 (the entry-prep legs)
 *   - any active zone touched within the last 3 bars
 *   - recent impulse within the last 10 bars
 *   - HTF zone touch confluence (not implemented here — we'd need HTF candles)
 *
 * Weights are eyeballed; calibrate via backtest later.
 */
export function scoreOne({ symbol, timeframe, candles }: ScanInputs): ScannerEntry | null {
  if (candles.length < 60) return null;
  const last = candles[candles.length - 1];
  const zones = computeZones(candles);
  const waves = computeWaves(candles);
  const impulses = detectImpulses(candles);

  let score = 0;
  const reasons: string[] = [];

  // Active wave count. Big bonus if at point 2 or 4 (entry-trigger).
  const activeWave = waves.find((w) => w.active);
  if (activeWave) {
    const lastPt = activeWave.points[activeWave.points.length - 1].label;
    if (lastPt === 2 || lastPt === 4) {
      score += 50;
      reasons.push(`wave-${(lastPt + 1) as 3 | 5} entry forming (${activeWave.direction})`);
    } else if (lastPt === 1 || lastPt === 3) {
      score += 25;
      reasons.push(`wave at point ${lastPt} (${activeWave.direction}) — building`);
    } else if (lastPt === 0) {
      score += 10;
      reasons.push(`fresh impulse, wave count starting (${activeWave.direction})`);
    }
  }

  // Recent zone touch.
  for (let i = candles.length - 4; i < candles.length; i += 1) {
    if (i < 0) continue;
    const c = candles[i];
    const touched = zones.find((z) => z.state === 'active' && c.high >= z.bottom && c.low <= z.top);
    if (touched) {
      score += 20;
      reasons.push(
        `${touched.type} touched at ${touched.bottom.toFixed(4)}–${touched.top.toFixed(4)}${
          touched.flipped ? ' (flipped — role reversal)' : ''
        }`,
      );
      break;
    }
  }

  // Recent impulse (last 10 bars).
  const recentImpulse = impulses[impulses.length - 1];
  if (recentImpulse && candles.length - recentImpulse.index <= 10) {
    score += 15;
    reasons.push(`recent ${recentImpulse.direction} impulse ${candles.length - recentImpulse.index} bar(s) ago`);
  }

  if (score === 0) return null;

  return { symbol, timeframe, score, reasons, lastClose: last.close, lastTime: last.time };
}

/**
 * Score a batch of (symbol, timeframe, candles) snapshots and return the
 * top-N by score. Pure function — caller fetches the candles however it
 * wants (existing SymbolManager subscriptions, on-demand REST fetches, etc.).
 */
export function rankWatchlist(inputs: ScanInputs[], topN = 20): ScannerEntry[] {
  const scored: ScannerEntry[] = [];
  for (const i of inputs) {
    const e = scoreOne(i);
    if (e) scored.push(e);
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
