import type { Alert, Candle, Timeframe } from '../../shared/types.js';
import { computeZones } from '../../shared/indicators/sr-zone-tracker.js';
import { computeWaves } from '../../shared/indicators/wave-counter.js';
import type { AlertRule, RuleContext } from './rule-types.js';
import { ALL_RULES } from './rules/index.js';

/**
 * Per (symbol, timeframe) streaming alert evaluator.
 *
 * On each closed candle:
 *   1. Recompute zones + waves from the rolling history.
 *   2. Build a RuleContext (with `prev` from the previous bar's evaluation).
 *   3. Run every rule. If a rule fires AND its cooldown has elapsed,
 *      emit an Alert.
 *
 * Cooldown is enforced per (rule, symbol, timeframe) — the same rule on
 * the same stream cannot fire more often than every `cooldownBars` bars.
 *
 * KISS for MVP: we recompute indicators from scratch on each candle. For
 * 1000-bar history that's <5ms — fine for personal-scale alerting.
 */
export class RuleEvaluator {
  private candles: Candle[] = [];
  private prevContext: Omit<RuleContext, 'prev'> | undefined;
  private lastFiredBar = new Map<string, number>(); // key = `${rule}:${symbol}:${tf}`
  private rules: AlertRule[];

  constructor(
    private symbol: string,
    private timeframe: Timeframe,
    private onAlert: (alert: Alert) => void,
    rules: AlertRule[] = ALL_RULES,
  ) {
    this.rules = rules;
  }

  /** Push a new candle. Indicator state is recomputed from the rolling buffer. */
  feed(candle: Candle): void {
    if (candle.symbol !== this.symbol || candle.timeframe !== this.timeframe) return;
    // Treat .closed=true as "this bar is final, evaluate rules". Live ticks on
    // an open bar don't trigger evaluation — we wait until close.
    if (this.candles.length === 0 || candle.time !== this.candles[this.candles.length - 1].time) {
      this.candles.push(candle);
    } else {
      this.candles[this.candles.length - 1] = candle;
    }
    if (this.candles.length > 2000) this.candles.shift();

    if (!candle.closed) return;
    this.evaluate();
  }

  /** Seed with a historical batch (cold-start backfill). Does not evaluate rules. */
  seed(candles: Candle[]): void {
    this.candles = candles.slice(-2000);
  }

  /** Read-only snapshot of the rolling candle buffer. Used by the scanner. */
  snapshot(): Candle[] {
    return this.candles;
  }

  private evaluate(): void {
    const candle = this.candles[this.candles.length - 1];
    const zones = computeZones(this.candles);
    const waves = computeWaves(this.candles);
    const ctx: RuleContext = {
      symbol: this.symbol,
      timeframe: this.timeframe,
      candles: this.candles,
      candle,
      zones,
      waves,
      prev: this.prevContext,
    };

    for (const rule of this.rules) {
      const fired = rule.evaluate(ctx);
      if (!fired) continue;
      const cooldownKey = `${rule.key}:${this.symbol}:${this.timeframe}`;
      const lastBar = this.lastFiredBar.get(cooldownKey) ?? -Infinity;
      const barsSince = (candle.time - lastBar) / candleStrideSec(this.candles);
      if (barsSince < rule.cooldownBars) continue;

      const alert: Alert = {
        id: `${cooldownKey}:${candle.time}`,
        symbol: this.symbol,
        timeframe: this.timeframe,
        time: candle.time,
        price: candle.close,
        ...fired,
      };
      this.lastFiredBar.set(cooldownKey, candle.time);
      this.onAlert(alert);
    }

    const { prev: _, ...rest } = ctx;
    void _;
    this.prevContext = rest;
  }
}

function candleStrideSec(candles: Candle[]): number {
  if (candles.length < 2) return 60;
  return Math.max(60, candles[candles.length - 1].time - candles[candles.length - 2].time);
}
