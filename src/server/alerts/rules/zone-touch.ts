import type { AlertRule } from '../rule-types.js';

/**
 * Fires when the latest closed bar's wick touches an active S/R zone.
 * The zone has to be untested-or-tested (not broken). Useful as an
 * "early-warning" alert before a wave count even forms.
 *
 * Cooldown: 6 bars per (symbol, timeframe) — won't spam if price hangs
 * around the zone for several bars.
 */
export const zoneTouchRule: AlertRule = {
  key: 'zone-touch',
  cooldownBars: 6,
  evaluate(ctx) {
    const c = ctx.candle;
    const touched = ctx.zones.find(
      (z) => z.state === 'active' && c.high >= z.bottom && c.low <= z.top,
    );
    if (!touched) return null;
    if (ctx.prev) {
      const prevTouched = ctx.prev.zones.find(
        (z) => z.id === touched.id && z.state === 'active' && ctx.prev!.candle.high >= z.bottom && ctx.prev!.candle.low <= z.top,
      );
      if (prevTouched) return null; // continuous touch, already fired
    }
    return {
      rule: 'zone-touch',
      direction: touched.type === 'support' ? 'bull' : 'bear',
      headline: `${ctx.symbol} ${ctx.timeframe} — touched ${touched.type} ${touched.bottom.toFixed(4)}–${touched.top.toFixed(4)}`,
      meta: { zoneId: touched.id, zoneTop: touched.top, zoneBottom: touched.bottom },
    };
  },
};
