import { describe, expect, it } from "vitest";
import { buildCandles } from "./fixtures/synth.js";
import { macd } from "../src/shared/indicators/macd.js";
import { parabolicSar } from "../src/shared/indicators/parabolic-sar.js";
import { dmi } from "../src/shared/indicators/dmi.js";
import { stochasticRsi } from "../src/shared/indicators/stochastic-rsi.js";

const up = buildCandles(
  Array.from({ length: 80 }, () => ({ trend: 1 })),
  100,
);
const down = buildCandles(
  Array.from({ length: 80 }, () => ({ trend: -1 })),
  200,
);
const last = (a: number[]) => a[a.length - 1];

describe("macd", () => {
  it("aligns to candle length and signs with trend", () => {
    const u = macd(up);
    const d = macd(down);
    expect(u.macd.length).toBe(up.length);
    expect(u.histogram.length).toBe(up.length);
    expect(Number.isFinite(last(u.macd))).toBe(true);
    expect(last(u.macd)).toBeGreaterThan(0); // fast EMA above slow in uptrend
    expect(last(d.macd)).toBeLessThan(0);
  });
});

describe("parabolicSar", () => {
  it("sits below price in uptrend, above in downtrend", () => {
    const u = parabolicSar(up);
    const d = parabolicSar(down);
    expect(u.trend[u.trend.length - 1]).toBe("up");
    expect(last(u.sar)).toBeLessThan(last(up.map((c) => c.close)));
    expect(d.trend[d.trend.length - 1]).toBe("down");
    expect(last(d.sar)).toBeGreaterThan(last(down.map((c) => c.close)));
  });
});

describe("dmi", () => {
  it("directional dominance + strong ADX in a clean trend", () => {
    const u = dmi(up);
    const d = dmi(down);
    expect(last(u.plusDI)).toBeGreaterThan(last(u.minusDI));
    expect(last(d.minusDI)).toBeGreaterThan(last(d.plusDI));
    expect(last(u.adx)).toBeGreaterThan(20);
  });
});

describe("stochasticRsi", () => {
  it("stays within 0..100 where defined", () => {
    const { k, d } = stochasticRsi(up);
    expect(k.length).toBe(up.length);
    for (const v of [...k, ...d]) {
      if (Number.isFinite(v)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
