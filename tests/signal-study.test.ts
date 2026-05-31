import { describe, expect, it } from "vitest";
import { buildCandles } from "./fixtures/synth.js";
import { runSignalStudy } from "../src/server/signal-study/study-engine.js";
import { HORIZONS } from "../src/server/signal-study/types.js";

// 400-bar wavy series so multiple signals actually fire.
const specs = Array.from({ length: 400 }, (_, i) => ({
  trend: Math.sin(i / 8) * 1.5 + Math.sin(i / 3) * 0.4,
  volMult: 1 + Math.abs(Math.sin(i / 5)) * 1.5,
}));
const candles = buildCandles(specs, 100, 0.6);

describe("runSignalStudy", () => {
  const r = runSignalStudy("TEST", candles);

  it("produces one row per signal with a full horizon matrix", () => {
    expect(r.rows.length).toBe(10);
    expect(Object.keys(r.details).length).toBe(10);
    for (const row of r.rows) {
      for (const h of HORIZONS) {
        expect(h in row.avgByHorizon).toBe(true);
        const v = row.avgByHorizon[h];
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("aligns chart series to candle length", () => {
    expect(r.closes.length).toBe(candles.length);
    expect(r.volumes.length).toBe(candles.length);
    expect(r.times.length).toBe(candles.length);
    expect(r.bars).toBe(candles.length);
  });

  it("detail donut totals never exceed event count", () => {
    for (const d of Object.values(r.details)) {
      expect(d.donut.win + d.donut.breakeven + d.donut.loss).toBe(
        d.donut.total,
      );
      expect(d.donut.total).toBeLessThanOrEqual(d.eventIdx.length);
    }
  });
});
