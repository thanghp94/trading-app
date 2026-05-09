/**
 * All tunable thresholds for the impulse detector and wave counter live here
 * as named constants. Edit, restart the dev server, see the impact.
 *
 * Defaults are eyeballed starting points based on the user's screenshots.
 * Tighten if too many false impulses fire; loosen if real setups are missed.
 *
 * Every threshold change should be re-validated against the Vitest fixture
 * suite in `tests/wave-counter.test.ts` — those are your golden cases.
 */

// ───────── Strong-bar / impulse rules ─────────

/** body / ATR(14) must exceed this for a bar to qualify as "strong". */
export const STRONG_BAR_BODY_ATR = 0.8;

/** body / range must exceed this — keeps wide-wick bars (indecision) out. */
export const STRONG_BAR_BODY_RANGE = 0.6;

/**
 * For bull impulse: close must be in the top X of the range.
 * For bear impulse: close must be in the bottom X.
 * 0.25 means "close in top 25% of the bar's H-L range".
 */
export const STRONG_BAR_CLOSE_POSITION = 0.25;

/** volume / SMA(volume, VOL_SMA_PERIOD) must exceed this to confirm an impulse. */
export const VOL_MULTIPLIER = 1.5;
export const VOL_SMA_PERIOD = 20;

/**
 * For zero-volume markets (forex spot, where TwelveData returns volume=0),
 * volume confirmation cannot be enforced. When this is true, impulse falls
 * back to a RANGE-EXPANSION proxy: the bar must be unusually wide vs ATR.
 * This is a stand-in for "high participation" since wide bars correlate
 * with institutional flow even when raw volume isn't available.
 */
export const ALLOW_ZERO_VOLUME_CONFIRM = true;

/**
 * When ALLOW_ZERO_VOLUME_CONFIRM applies, require range / ATR(14) > this
 * value before treating the bar as a confirmed impulse. Defaults to 1.2 —
 * the bar must be appreciably wider than typical recent bars. Tunable.
 */
export const RANGE_EXPANSION_ATR = 1.2;

// ───────── Wave counter rules ─────────

/** Fractal width for swing-pivot detection. N=2 → 5-bar fractal. */
export const PIVOT_FRACTAL_N = 2;

/** Min spacing between consecutive wave pivots, in ATR units. Filters chop. */
export const MIN_PIVOT_DISTANCE_ATR = 0.5;

/**
 * Number of consecutive min-distance rejections after which we abandon the
 * wave count and assume the regime is sideways chop.
 */
export const RESET_REJECTED_PIVOTS = 3;

/**
 * If no new confirmed pivot appears within this many bars of the active
 * timeframe, the wave count resets. Replaces the design doc's "6 hours"
 * with a timeframe-relative count.
 */
export const RESET_NO_PIVOT_BARS = 20;

/** Maximum wave label. Once we hit point 5 the count completes. */
export const MAX_WAVE_POINT = 5;
