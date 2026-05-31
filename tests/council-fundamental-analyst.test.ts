import { describe, it, expect } from "vitest";
import {
  analystFundamental,
  fundamentalSummary,
} from "../src/server/ai/council/agents.js";
import type { CouncilContext } from "../src/server/ai/council/types.js";
import type { Fundamentals } from "../src/server/fundamentals/types.js";
import type { Ownership } from "../src/server/fundamentals/ownership-types.js";

function baseCtx(): CouncilContext {
  return {
    symbol: "FPT",
    timeframe: "1d",
    lastCandleTime: 1,
    recentCandles: [
      {
        symbol: "FPT",
        timeframe: "1d",
        time: 1,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1,
        closed: true,
      },
    ],
    zones: [],
    waves: [],
    mtf: null,
  };
}

function fundamentals(): Fundamentals {
  return {
    valuation: {
      symbol: "FPT",
      pe: 12.58,
      pb: 3.13,
      roe: 0.268,
      eps: 1460,
      marketCap: 121_971_109_863_600,
      dividendYield: 0,
      asOf: 1,
    },
    statements: [
      {
        period: "2026-Q1",
        revenue: 12_479_997_206_775,
        grossProfit: 4e12,
        netProfit: 2_476_789_833_481,
        totalAssets: 6e13,
        totalEquity: 4e13,
        operatingCashflow: -2e12,
      },
    ],
  };
}

function ownership(): Ownership {
  return {
    symbol: "FPT",
    structure: { foreignPct: 0.2847, statePct: 0.0567, freeFloatPct: 0.85 },
    shareholders: [
      {
        name: "Trương Gia Bình",
        quantity: 1e8,
        pct: 0.0689,
        asOf: "2026-02-03",
      },
    ],
    officers: [],
    asOf: 1,
  };
}

describe("fundamentalSummary", () => {
  it("returns empty string when no fundamentals attached", () => {
    expect(fundamentalSummary(baseCtx())).toBe("");
  });

  it("formats valuation + statement + ownership, omitting nulls", () => {
    const ctx = {
      ...baseCtx(),
      fundamentals: fundamentals(),
      ownership: ownership(),
    };
    const s = fundamentalSummary(ctx);
    expect(s).toContain("P/E 12.58");
    expect(s).toContain("ROE 26.8%");
    expect(s).toContain("Quý 2026-Q1");
    expect(s).toContain("Trương Gia Bình");
    expect(s).toContain("NN 28.5%");
    expect(s).not.toContain("data unavailable");
  });
});

describe("analystFundamental", () => {
  it("uses real data prompt when fundamentals present (no stub marker)", () => {
    const ctx = {
      ...baseCtx(),
      fundamentals: fundamentals(),
      ownership: ownership(),
    };
    const spec = analystFundamental(ctx);
    expect(spec.user).toContain("P/E 12.58");
    expect(spec.user).not.toContain("No fundamental data is available");
    expect(spec.system).toContain("VN equities");
  });

  it("falls back to the data-unavailable stub when no fundamentals (e.g. crypto)", () => {
    const spec = analystFundamental(baseCtx());
    expect(spec.user).toContain("data unavailable");
  });
});
