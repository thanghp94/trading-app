import { describe, it, expect } from "vitest";
import {
  computeValueScore,
  toScreenerFundamentals,
  enrichRows,
} from "../src/server/screener/fundamental-filter.js";
import type { ScreenerRow } from "../src/shared/screener-types.js";
import type { Fundamentals } from "../src/server/fundamentals/types.js";

function fundamentals(
  pe: number | null,
  pb: number | null,
  roe: number | null,
  dividendYield: number | null,
): Fundamentals {
  return {
    valuation: {
      symbol: "X",
      pe,
      pb,
      roe,
      eps: 1000,
      marketCap: 1e13,
      dividendYield,
      asOf: 1,
    },
    statements: [],
  };
}

describe("computeValueScore", () => {
  it("high ROE + low P/E + low P/B → high score", () => {
    const s = computeValueScore({
      pe: 8,
      pb: 1,
      roe: 0.25,
      dividendYield: 0.06,
    });
    expect(s).toBe(100);
  });

  it("worst inputs → 0", () => {
    const s = computeValueScore({ pe: 30, pb: 4, roe: 0, dividendYield: 0 });
    expect(s).toBe(0);
  });

  it("clamps beyond bounds", () => {
    const s = computeValueScore({
      pe: 4,
      pb: 0.5,
      roe: 0.4,
      dividendYield: 0.1,
    });
    expect(s).toBe(100);
  });

  it("ignores null + non-positive ratios, averages remaining", () => {
    // only ROE present (mid) → score = its component
    const s = computeValueScore({
      pe: null,
      pb: -1,
      roe: 0.125,
      dividendYield: null,
    });
    expect(s).toBe(50); // 0.125 halfway between 0 and 0.25
  });

  it("all null → null", () => {
    expect(
      computeValueScore({ pe: null, pb: null, roe: null, dividendYield: null }),
    ).toBeNull();
  });

  it("P/E weighted toward lower being better", () => {
    const lowPe = computeValueScore({
      pe: 8,
      pb: null,
      roe: null,
      dividendYield: null,
    });
    const highPe = computeValueScore({
      pe: 30,
      pb: null,
      roe: null,
      dividendYield: null,
    });
    expect(lowPe!).toBeGreaterThan(highPe!);
  });
});

describe("toScreenerFundamentals", () => {
  it("maps valuation fields + value score", () => {
    const f = toScreenerFundamentals(fundamentals(12, 2, 0.2, 0.03));
    expect(f.pe).toBe(12);
    expect(f.roe).toBe(0.2);
    expect(f.marketCap).toBe(1e13);
    expect(f.valueScore).toBeGreaterThan(0);
    expect(f.valueScore).toBeLessThanOrEqual(100);
  });
});

describe("enrichRows", () => {
  const baseRow = (symbol: string): ScreenerRow =>
    ({
      symbol,
      sector: "X",
      close: 1,
      changePct: 0,
      volume: 1,
      star: 3,
      score: 1,
      signals: {},
      blackbox: {},
      reasons: [],
      asOf: 1,
    }) as unknown as ScreenerRow;

  it("attaches fundamentals on cache hit, leaves undefined on miss", () => {
    const cache: Record<string, Fundamentals> = {
      FPT: fundamentals(12, 2, 0.2, 0.03),
    };
    const rows = [baseRow("FPT"), baseRow("VCB")];
    const out = enrichRows(rows, (s) => cache[s] ?? null);
    expect(out[0].fundamentals?.pe).toBe(12);
    expect(out[1].fundamentals).toBeUndefined();
  });

  it("does not mutate the input rows", () => {
    const rows = [baseRow("FPT")];
    enrichRows(rows, () => fundamentals(10, 1, 0.3, 0.05));
    expect(rows[0].fundamentals).toBeUndefined();
  });
});
