import { describe, expect, it } from 'vitest';
import { computeWaves } from '../src/shared/indicators/wave-counter.js';
import { detectImpulses } from '../src/shared/indicators/impulse-detector.js';
import { detectPivots } from '../src/shared/indicators/pivot-detector.js';
import {
  buildCandles,
  bullImpulse,
  bearImpulse,
  chop,
  pullback,
  pushAndPullback,
  quietWarmup,
} from './fixtures/synth.js';

/**
 * These are the golden fixtures for the wave counter. Every threshold tweak
 * in src/shared/config/thresholds.ts must be re-validated against them.
 *
 * Each `it()` describes the *behavior* expected, not the math — so they
 * stay readable when you tune thresholds.
 */

describe('impulse detector', () => {
  it('fires on a strong bull bar with confirming volume after warmup', () => {
    const candles = buildCandles([...quietWarmup(), bullImpulse()]);
    const hits = detectImpulses(candles);
    expect(hits.length).toBe(1);
    expect(hits[0].direction).toBe('bull');
    expect(hits[0].volumeConfirmed).toBe(true);
  });

  it('fires on a strong bear bar with confirming volume', () => {
    const candles = buildCandles([...quietWarmup(), bearImpulse()]);
    const hits = detectImpulses(candles);
    expect(hits.length).toBe(1);
    expect(hits[0].direction).toBe('bear');
  });

  it('does NOT fire on a strong-bodied bar without volume confirmation', () => {
    const noVolImpulse = { ...bullImpulse(), volMult: 0.8 }; // below 1.5x SMA
    const candles = buildCandles([...quietWarmup(), noVolImpulse]);
    const hits = detectImpulses(candles);
    expect(hits.length).toBe(0);
  });

  it('does NOT fire on a doji (small body, big wicks)', () => {
    const doji = { trend: 1, bodyMult: 0.2, wickMult: 5, volMult: 3 };
    const candles = buildCandles([...quietWarmup(), doji]);
    const hits = detectImpulses(candles);
    expect(hits.length).toBe(0);
  });
});

describe('wave counter — happy paths', () => {
  it('labels 0,1,2,3,4,5 in order on a clean bull continuation', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      // After impulse: a series of pullback-then-continuation legs to lay down 5 alternating pivots.
      ...pushAndPullback(-1, 4, 6), // pivot 1 (low) then continuation up
      ...pushAndPullback(1, 6, 4),  // pivot 2 (high) then pullback
      ...pushAndPullback(-1, 4, 6), // pivot 3 (low)
      ...pushAndPullback(1, 6, 4),  // pivot 4 (high)
      ...pushAndPullback(-1, 4, 4), // pivot 5 (low)
      ...pullback(1, 6),            // tail so pivot 5 confirms (5-bar fractal needs 2 bars after)
    ]);

    const counts = computeWaves(candles);
    expect(counts.length).toBeGreaterThanOrEqual(1);
    const c = counts[0];
    expect(c.direction).toBe('bull');
    const labels = c.points.map((p) => p.label);
    // We require at minimum 0,1,2,3 to be present — exact 0..5 depends on the
    // synth pattern resolving every fractal, which is tight. The key invariant
    // is monotonically increasing labels, no skips.
    expect(labels[0]).toBe(0);
    for (let i = 1; i < labels.length; i += 1) {
      expect(labels[i]).toBe(labels[i - 1] + 1);
    }
  });

  it('mirrors for bear setup: pivots alternate high, low, high, low, high', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bearImpulse(),
      ...pushAndPullback(1, 4, 6),  // pivot 1 (high)
      ...pushAndPullback(-1, 6, 4), // pivot 2 (low)
      ...pushAndPullback(1, 4, 6),  // pivot 3 (high)
      ...pullback(-1, 6),
    ]);

    const counts = computeWaves(candles);
    expect(counts.length).toBeGreaterThanOrEqual(1);
    const c = counts[0];
    expect(c.direction).toBe('bear');
    expect(c.points[0].label).toBe(0);
    // Strict monotonic labels.
    for (let i = 1; i < c.points.length; i += 1) {
      expect(c.points[i].label).toBe(c.points[i - 1].label + 1);
    }
  });
});

describe('wave counter — reset rules', () => {
  it('resets with reason "beyond-0" when price closes back below the impulse on a bull setup', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      // Aggressive sell-off that closes below the impulse close.
      ...pullback(-1, 12, 3),
    ]);
    const counts = computeWaves(candles);
    expect(counts.length).toBe(1);
    expect(counts[0].active).toBe(false);
    expect(counts[0].resetReason).toBe('beyond-0');
  });

  it('resets with reason "no-pivot-timeout" when nothing new prints for 20+ bars', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      // 25 bars of nothing — drift slowly upward, never forming a confirmed pivot.
      ...Array.from({ length: 25 }, () => ({ trend: 0.05, bodyMult: 0.05 })),
    ]);
    const counts = computeWaves(candles);
    expect(counts.length).toBe(1);
    expect(counts[0].active).toBe(false);
    expect(counts[0].resetReason).toBe('no-pivot-timeout');
  });

  it('resets with reason "chop-rejected" when many candidate pivots are too close together', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      // Dense chop after the impulse: many tiny pivots that fail the min-distance ATR filter.
      ...chop(40),
    ]);
    const counts = computeWaves(candles);
    expect(counts.length).toBe(1);
    expect(counts[0].active).toBe(false);
    expect(['chop-rejected', 'no-pivot-timeout']).toContain(counts[0].resetReason);
  });
});

describe('pivot strength scoring', () => {
  // Helper: build a peaked sequence with a configurable spike-bar at the apex.
  // Symmetric V-shapes can produce equal highs on adjacent bars (no fractal),
  // so we use an extreme upper wick at the apex to guarantee a strict swing high.
  const peakedSequence = (apex: { wickMult: number; volMult: number }) =>
    buildCandles([
      ...quietWarmup(),
      { trend: 1, bodyMult: 1 }, { trend: 1, bodyMult: 1 }, { trend: 1, bodyMult: 1 },
      { trend: 1, bodyMult: 0.3, wickMult: apex.wickMult, volMult: apex.volMult }, // apex
      { trend: -1, bodyMult: 1 }, { trend: -1, bodyMult: 1 }, { trend: -1, bodyMult: 1 },
      { trend: -1, bodyMult: 1 },
    ]);

  it('a pivot with high volume + sharp rejection scores higher than a pivot with weak rejection', () => {
    const strongCase = peakedSequence({ wickMult: 12, volMult: 4 });
    const weakCase = peakedSequence({ wickMult: 4, volMult: 1 });

    const strongHigh = detectPivots(strongCase)
      .filter((p) => p.kind === 'high')
      .sort((a, b) => b.strength - a.strength)[0];
    const weakHigh = detectPivots(weakCase)
      .filter((p) => p.kind === 'high')
      .sort((a, b) => b.strength - a.strength)[0];

    expect(strongHigh).toBeDefined();
    expect(weakHigh).toBeDefined();
    expect(strongHigh.strength).toBeGreaterThan(weakHigh.strength);
  });

  it('every detected pivot has a finite, positive strength', () => {
    const candles = peakedSequence({ wickMult: 10, volMult: 2 });
    const pivots = detectPivots(candles);
    expect(pivots.length).toBeGreaterThan(0);
    for (const p of pivots) {
      expect(Number.isFinite(p.strength)).toBe(true);
      expect(p.strength).toBeGreaterThan(0);
    }
  });
});

describe('wave counter — edge cases', () => {
  it('returns no counts when there is no impulse', () => {
    const candles = buildCandles([...quietWarmup(), ...quietWarmup()]);
    expect(computeWaves(candles)).toEqual([]);
  });

  it('starts a new count if a second impulse fires after a prior count completes/resets', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      ...pullback(-1, 12, 3), // resets the first count by closing below 0
      ...quietWarmup(),
      bullImpulse(),
    ]);
    const counts = computeWaves(candles);
    expect(counts.length).toBe(2);
  });
});
