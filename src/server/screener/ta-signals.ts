import type { Candle } from "../../shared/types.js";
import type { ScreenerSignals } from "../../shared/screener-types.js";
import { ema } from "../../shared/indicators/ema.js";
import { rsi } from "../../shared/indicators/rsi.js";
import { computeZones } from "../../shared/indicators/sr-zone-tracker.js";
import { detectPatterns } from "../../shared/indicators/pattern-detector.js";
import { volumeSma } from "../../shared/indicators/impulse-detector.js";
import { ichimokuSignal } from "../../shared/indicators/ichimoku.js";
import { detectDivergence } from "../../shared/indicators/divergence.js";

const TREND_EMA = 50;
const HILO_LOOKBACK = 50;
const PATTERN_RECENT_BARS = 5;
const VOL_SPIKE_MULT = 1.8;

/** Compute the TA signal block for one symbol's daily candles. */
export function computeTaSignals(candles: Candle[]): ScreenerSignals {
  const i = candles.length - 1;
  const last = candles[i];

  // Trend: close vs EMA(50) + EMA slope.
  const e = ema(candles, TREND_EMA);
  const emaNow = e[i];
  const emaPrev = e[i - 1];
  let trend: ScreenerSignals["trend"] = "side";
  if (Number.isFinite(emaNow) && Number.isFinite(emaPrev)) {
    if (last.close > emaNow && emaNow >= emaPrev) trend = "up";
    else if (last.close < emaNow && emaNow <= emaPrev) trend = "down";
  }

  // RSI(14) + zone.
  const r = rsi(candles, 14);
  const rsiVal = r[i];
  const rsiZone = !Number.isFinite(rsiVal)
    ? null
    : rsiVal < 30
      ? "oversold"
      : rsiVal > 70
        ? "overbought"
        : null;

  // Reversal patterns formed within the last few bars.
  const patterns = detectPatterns(candles);
  let bullishPattern = false;
  let bearishPattern = false;
  const recentCutoff = candles[Math.max(0, i - PATTERN_RECENT_BARS)].time;
  for (const p of patterns) {
    if (p.formedAt < recentCutoff) continue;
    if (p.kind === "double-bottom" || p.kind === "inverse-head-and-shoulders")
      bullishPattern = true;
    if (p.kind === "double-top" || p.kind === "head-and-shoulders")
      bearishPattern = true;
  }

  // Volume spike on the last bar.
  const vsma = volumeSma(candles, 20)[i];
  const volumeSpike =
    Number.isFinite(vsma) && vsma > 0 && last.volume > VOL_SPIKE_MULT * vsma;

  // Active S/R zone touched on the last bar.
  const zones = computeZones(candles);
  const touched = zones.find(
    (z) => z.state === "active" && last.high >= z.bottom && last.low <= z.top,
  );
  const zoneTouch = touched ? touched.type : null;

  // New high / low over the lookback window.
  const start = Math.max(0, i - HILO_LOOKBACK + 1);
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = start; j < i; j += 1) {
    if (candles[j].high > hi) hi = candles[j].high;
    if (candles[j].low < lo) lo = candles[j].low;
  }
  const newHigh = last.close >= hi;
  const newLow = last.close <= lo;

  return {
    trend,
    bullishPattern,
    bearishPattern,
    volumeSpike,
    rsi: Number.isFinite(rsiVal) ? rsiVal : NaN,
    rsiZone,
    zoneTouch,
    newHigh,
    newLow,
    ichimoku: ichimokuSignal(candles),
    divergence: detectDivergence(candles),
  };
}
