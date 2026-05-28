import type { ScreenerSignals } from "../../shared/screener-types.js";

export interface ScoreResult {
  score: number;
  star: number;
  reasons: string[];
}

/**
 * Composite bullish-setup score from TA signals (the QMV "Mức độ phù hợp" ★).
 * Bullish bias — surfaces buy setups, matching the screener's Bullish-Pattern
 * default. Weights are heuristic; calibrate via backtest later.
 */
export function scoreFromSignals(s: ScreenerSignals): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if (s.trend === "up") {
    score += 25;
    reasons.push("uptrend");
  } else if (s.trend === "down") {
    score -= 15;
  } else {
    score += 5;
  }

  if (s.bullishPattern) {
    score += 20;
    reasons.push("bullish pattern");
  }
  if (s.bearishPattern) {
    score -= 20;
    reasons.push("bearish pattern");
  }
  if (s.volumeSpike) {
    score += 15;
    reasons.push("volume spike");
  }
  if (s.rsiZone === "oversold") {
    score += 15;
    reasons.push("RSI oversold (bounce)");
  } else if (s.rsiZone === "overbought") {
    score -= 10;
  }
  if (s.zoneTouch === "support") {
    score += 15;
    reasons.push("at support");
  } else if (s.zoneTouch === "resistance") {
    score -= 10;
  }
  if (s.newHigh) {
    score += 10;
    reasons.push("new high (momentum)");
  }
  if (s.newLow) {
    score += 5;
    reasons.push("new low (watch reversal)");
  }
  if (s.ichimoku === "good") {
    score += 12;
    reasons.push("Ichimoku bullish");
  } else if (s.ichimoku === "bad") {
    score -= 12;
  }
  if (s.divergence === "bullish") {
    score += 18;
    reasons.push("bullish divergence");
  } else if (s.divergence === "hidden-bullish") {
    score += 10;
    reasons.push("hidden bullish divergence");
  } else if (s.divergence === "bearish") {
    score -= 18;
    reasons.push("bearish divergence");
  } else if (s.divergence === "hidden-bearish") {
    score -= 10;
  }

  const star =
    score >= 70 ? 5 : score >= 50 ? 4 : score >= 30 ? 3 : score >= 15 ? 2 : 1;
  return { score, star, reasons };
}
