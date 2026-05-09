import type { Alert, Candle, Timeframe } from '../../shared/types.js';
import type { Zone } from '../../shared/types.js';
import type { WaveCount } from '../../shared/indicators/wave-counter.js';

/**
 * Per-bar context handed to every rule on each closed bar.
 *
 * Rules are pure functions. They receive the rolling indicator state at
 * the moment of bar close, and return zero or one Alert. The `prev` field
 * lets a rule detect *transitions* (e.g. "wave count just hit point 2 on
 * this bar, vs. last bar where it was still at point 1").
 */
export interface RuleContext {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  /** Most recent closed candle. */
  candle: Candle;
  zones: Zone[];
  waves: WaveCount[];
  /** Same shape as the live state, but evaluated against the prior candle. Undefined on first bar. */
  prev?: Omit<RuleContext, 'prev'>;
}

export interface AlertRule {
  /** Unique key, e.g. 'wave-3-entry'. Used for cooldown bookkeeping and UI display. */
  key: string;
  /** Cooldown — same rule on same (symbol, timeframe) can fire at most once per N bars. */
  cooldownBars: number;
  /** Pure function: return an Alert to fire, or null. */
  evaluate: (ctx: RuleContext) => Omit<Alert, 'id' | 'symbol' | 'timeframe' | 'time' | 'price'> | null;
}
