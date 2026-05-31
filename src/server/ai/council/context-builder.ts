import type { Timeframe } from "../../../shared/types.js";
import { computeZones } from "../../../shared/indicators/sr-zone-tracker.js";
import { computeWaves } from "../../../shared/indicators/wave-counter.js";
import { checkMtf } from "../../../shared/indicators/mtf.js";
import type { AlertEngine } from "../../alerts/alert-engine.js";
import type { CouncilContext } from "./types.js";
import type { Fundamentals } from "../../fundamentals/types.js";
import type { Ownership } from "../../fundamentals/ownership-types.js";

/** Cache-only lookups for fundamentals/ownership (no python spawn on the council path). */
export interface FundamentalLookups {
  getFundamentals?: (symbol: string) => Fundamentals | null;
  getOwnership?: (symbol: string) => Ownership | null;
}

/**
 * Build a CouncilContext from the AlertEngine's in-memory candle snapshot.
 *
 * Returns null if the requested (symbol, timeframe) has no live evaluator yet.
 * Never throws — callers treat null as "council unavailable for this symbol/tf".
 */
export function buildContext(
  symbol: string,
  timeframe: Timeframe,
  alertEngine: AlertEngine,
  lookups: FundamentalLookups = {},
): CouncilContext | null {
  const snap = alertEngine
    .snapshots()
    .find((s) => s.symbol === symbol && s.timeframe === timeframe);

  if (!snap) return null;

  // Last 60 closed candles — more granularity than single-shot analyze.ts (30)
  const candles = snap.candles.slice(-60);
  if (candles.length === 0) return null;

  const zones = computeZones(candles);
  const waves = computeWaves(candles);

  const activeWave = waves.find((w) => w.active);
  let mtf = null;
  if (activeWave && candles.length > 0) {
    const result = checkMtf({
      baseCandles: candles,
      baseTf: timeframe,
      entryIdx: candles.length - 1,
      direction: activeWave.direction,
    });
    // Set null when both axes return no-data (not useful in prompts)
    mtf =
      result.trend === "no-data" && result.zone === "no-data" ? null : result;
  }

  return {
    symbol,
    timeframe,
    lastCandleTime: candles[candles.length - 1].time,
    recentCandles: candles,
    zones,
    waves,
    mtf,
    // Cache-only — null for crypto / non-VN / uncached symbols.
    fundamentals: lookups.getFundamentals?.(symbol) ?? null,
    ownership: lookups.getOwnership?.(symbol) ?? null,
  };
}
