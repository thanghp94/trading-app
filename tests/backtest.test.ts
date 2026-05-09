import { describe, expect, it } from 'vitest';
import { runBacktest } from '../src/server/backtest/backtest-engine.js';
import { buildCandles, bullImpulse, pullback, pushAndPullback, quietWarmup } from './fixtures/synth.js';

/**
 * Backtest engine fixture tests. Uses the same synth helpers as the wave
 * counter — guarantees backtest sees the same patterns the wave counter
 * recognizes.
 */

describe('backtest engine', () => {
  it('returns zero trades when there are no impulses', () => {
    const candles = buildCandles([...quietWarmup(), ...quietWarmup()]);
    const result = runBacktest({ symbol: 'TEST', timeframe: '5m', candles });
    expect(result.trades.length).toBe(0);
    expect(result.stats.total).toBe(0);
    expect(result.stats.finalBalance).toBe(10_000);
  });

  it('every produced trade has well-formed fields when waves are seeded', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      ...pushAndPullback(-1, 4, 6),
      ...pushAndPullback(1, 6, 4),
      ...pushAndPullback(-1, 4, 6),
      ...pushAndPullback(1, 6, 4),
      ...pullback(1, 6),
    ]);
    const result = runBacktest({ symbol: 'TEST', timeframe: '5m', candles });
    // Trade count varies with the synth pattern; the invariant we test is
    // structural correctness on whatever trades the engine produces.
    for (const t of result.trades) {
      expect(['win', 'loss', 'breakeven', 'time-stop']).toContain(t.outcome);
      expect(t.entry).toBeGreaterThan(0);
      expect(t.exit).toBeGreaterThan(0);
      expect(Number.isFinite(t.rMultiple)).toBe(true);
      expect(t.exitIdx).toBeGreaterThanOrEqual(t.entryIdx);
    }
    // Equity curve is consistent with trades.
    expect(result.equity.length).toBe(result.trades.length + 1);
  });

  it('respects custom slPct and rrTarget — losing trade caps at -1R, winning at +rrTarget', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      ...pushAndPullback(-1, 4, 6),
      ...pushAndPullback(1, 6, 4),
      ...pushAndPullback(-1, 4, 6),
      ...pushAndPullback(1, 6, 4),
      ...pullback(1, 6),
    ]);
    const result = runBacktest({ symbol: 'TEST', timeframe: '5m', candles, slPct: 0.005, rrTarget: 3 });
    for (const t of result.trades) {
      if (t.outcome === 'win') expect(t.rMultiple).toBeCloseTo(3, 1);
      if (t.outcome === 'loss') expect(t.rMultiple).toBeCloseTo(-1, 1);
    }
  });

  it('balance after wins increases, after losses decreases — sanity check on PnL math', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      ...pushAndPullback(-1, 4, 6),
      ...pushAndPullback(1, 6, 4),
      ...pushAndPullback(-1, 4, 6),
      ...pushAndPullback(1, 6, 4),
      ...pullback(1, 6),
    ]);
    const result = runBacktest({ symbol: 'TEST', timeframe: '5m', candles, riskPct: 1 });
    let prev = 10_000;
    for (const t of result.trades) {
      if (t.rMultiple > 0) expect(t.balanceAfter).toBeGreaterThan(prev);
      if (t.rMultiple < 0) expect(t.balanceAfter).toBeLessThan(prev);
      prev = t.balanceAfter;
    }
    if (result.trades.length > 0) {
      expect(result.stats.finalBalance).toBe(prev);
    }
  });

  it('equity curve has total + 1 entries (start + one per closed trade)', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      ...pushAndPullback(-1, 4, 6),
      ...pushAndPullback(1, 6, 4),
      ...pullback(1, 6),
    ]);
    const result = runBacktest({ symbol: 'TEST', timeframe: '5m', candles });
    expect(result.equity.length).toBe(result.trades.length + 1);
  });

  it('produces only finite numeric results regardless of fixture pattern', () => {
    const candles = buildCandles([
      ...quietWarmup(),
      bullImpulse(),
      ...pushAndPullback(-1, 4, 6),
      ...pushAndPullback(1, 6, 4),
      ...Array.from({ length: 60 }, () => ({ trend: 0, bodyMult: 0.05, wickMult: 0.05 })),
    ]);
    const result = runBacktest({ symbol: 'TEST', timeframe: '5m', candles, maxBars: 10, slPct: 0.05 });
    expect(Number.isFinite(result.stats.winRate)).toBe(true);
    expect(Number.isFinite(result.stats.avgR)).toBe(true);
    expect(Number.isFinite(result.stats.finalBalance)).toBe(true);
    expect(Number.isFinite(result.stats.maxDrawdownPct)).toBe(true);
    expect(result.stats.finalBalance).toBeGreaterThan(0);
  });
});
