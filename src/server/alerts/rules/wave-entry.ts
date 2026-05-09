import type { AlertRule } from '../rule-types.js';

/**
 * Fires when a wave count's most-recent confirmed point becomes 2 or 4 —
 * the legs the user trades (2→3 and 4→5 continuations).
 *
 * "Just transitioned to point N" is the trigger: we compare the top
 * unfinalized count against its prior-bar state. This avoids re-firing on
 * every subsequent bar while the count sits at the same point.
 */
export const wave3EntryRule: AlertRule = {
  key: 'wave-3-entry',
  cooldownBars: 8,
  evaluate(ctx) {
    const active = ctx.waves.find((w) => w.active);
    if (!active) return null;
    const lastPoint = active.points[active.points.length - 1];
    if (lastPoint.label !== 2) return null;

    // Did this just transition? Look at prev — if prev had point 2 already, skip.
    if (ctx.prev) {
      const prevActive = ctx.prev.waves.find((w) => w.id === active.id && w.active);
      if (prevActive) {
        const prevLastLabel = prevActive.points[prevActive.points.length - 1].label;
        if (prevLastLabel >= 2) return null;
      }
    }

    return {
      rule: 'wave-3-entry',
      direction: active.direction,
      // wave-3 entry is the SECONDARY preference per teacher: wave 1 has printed
      // but you haven't yet seen wave 3 confirm. Trade-able but with less conviction.
      headline: `${ctx.symbol} ${ctx.timeframe} — wave-3 entry forming (${active.direction}, secondary)`,
      meta: {
        point0: active.points[0],
        point2: lastPoint,
        preference: 'secondary',
      },
    };
  },
};

export const wave5EntryRule: AlertRule = {
  key: 'wave-5-entry',
  cooldownBars: 8,
  evaluate(ctx) {
    const active = ctx.waves.find((w) => w.active);
    if (!active) return null;
    const lastPoint = active.points[active.points.length - 1];
    if (lastPoint.label !== 4) return null;
    if (ctx.prev) {
      const prevActive = ctx.prev.waves.find((w) => w.id === active.id && w.active);
      if (prevActive) {
        const prevLastLabel = prevActive.points[prevActive.points.length - 1].label;
        if (prevLastLabel >= 4) return null;
      }
    }
    return {
      rule: 'wave-5-entry',
      direction: active.direction,
      // wave-5 entry is the PREFERRED entry per teacher: by now wave 3 has
      // confirmed the impulse, so wave 5 has higher conviction than wave 3.
      headline: `★ ${ctx.symbol} ${ctx.timeframe} — wave-5 entry forming (${active.direction}, preferred)`,
      meta: {
        point0: active.points[0],
        point4: lastPoint,
        preference: 'preferred',
      },
    };
  },
};

// Aggregate rule list lives in ./index.ts to avoid circular import.
