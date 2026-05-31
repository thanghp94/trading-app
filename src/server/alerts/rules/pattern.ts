import { detectPatterns } from "../../../shared/indicators/pattern-detector.js";
import { fmtPrice } from "../fmt-price.js";
import type { AlertRule } from "../rule-types.js";

/**
 * Fires when a chart pattern (double top/bottom, H&S, inverse H&S)
 * just-formed (its confirming pivot wasn't there last bar).
 *
 * Cooldown 12 bars per (rule, symbol, tf) — patterns reform on similar
 * pivot structure; this prevents spam.
 */
export const patternFormedRule: AlertRule = {
  key: "pattern-formed",
  cooldownBars: 12,
  evaluate(ctx) {
    const current = detectPatterns(ctx.candles);
    if (current.length === 0) return null;
    const latest = current[current.length - 1];
    // Only fire on patterns whose confirming pivot is the most recent candle's
    // forward window (i.e. just confirmed).
    const lastCandle = ctx.candle;
    if (latest.formedAt < lastCandle.time - ctx.candles.length * 60)
      return null;
    if (ctx.prev) {
      const prevPatterns = detectPatterns(ctx.prev.candles);
      if (
        prevPatterns.find(
          (p) => p.kind === latest.kind && p.formedAt === latest.formedAt,
        )
      ) {
        return null; // already fired last bar
      }
    }
    const isBearish =
      latest.kind === "double-top" || latest.kind === "head-and-shoulders";
    return {
      rule: "pattern-formed",
      direction: isBearish ? "bear" : "bull",
      headline: `${ctx.symbol} ${ctx.timeframe} — ${latest.kind} formed (neckline ${fmtPrice(latest.neckline, ctx.symbol)})`,
      meta: {
        kind: latest.kind,
        neckline: latest.neckline,
        confidence: latest.confidence,
        pivotTimes: latest.pivots.map((p) => p.time),
      },
    };
  },
};
