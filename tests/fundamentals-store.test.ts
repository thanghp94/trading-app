import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FundamentalsStore } from "../src/server/fundamentals/fundamentals-store.js";
import {
  refreshSymbol,
  refreshSymbols,
} from "../src/server/fundamentals/refresh.js";
import type { Fundamentals } from "../src/server/fundamentals/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "fundamentals-test-"));
  process.env.JOURNAL_DB_PATH = join(tmpDir, "test.db");
});

afterEach(() => {
  delete process.env.JOURNAL_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

function sample(symbol: string): Fundamentals {
  return {
    valuation: {
      symbol,
      pe: 12.5,
      pb: 3.1,
      roe: 0.26,
      eps: 1460,
      marketCap: 1.2e14,
      dividendYield: 0,
      asOf: 1_700_000_000_000,
    },
    statements: [
      {
        period: "2026-Q1",
        revenue: 1e12,
        grossProfit: 4e11,
        netProfit: 2e11,
        totalAssets: 6e13,
        totalEquity: 4e13,
        operatingCashflow: -2e12,
      },
    ],
  };
}

describe("FundamentalsStore", () => {
  it("missing symbol → null", () => {
    const store = new FundamentalsStore();
    expect(store.get("NONE")).toBeNull();
    expect(store.ageSec("NONE")).toBeNull();
  });

  it("set→get round-trip preserves payload", () => {
    const store = new FundamentalsStore();
    store.set("FPT", sample("FPT"));
    const got = store.get("FPT");
    expect(got?.valuation.pe).toBe(12.5);
    expect(got?.statements[0].period).toBe("2026-Q1");
  });

  it("is case-insensitive on symbol", () => {
    const store = new FundamentalsStore();
    store.set("fpt", sample("FPT"));
    expect(store.get("FPT")).not.toBeNull();
  });

  it("upsert replaces existing row", () => {
    const store = new FundamentalsStore();
    store.set("FPT", sample("FPT"));
    const updated = sample("FPT");
    updated.valuation.pe = 99;
    store.set("FPT", updated);
    expect(store.get("FPT")?.valuation.pe).toBe(99);
  });

  it("isStale: fresh row within ttl is not stale", () => {
    const store = new FundamentalsStore();
    store.set("FPT", sample("FPT"));
    expect(store.isStale("FPT", 3600)).toBe(false);
  });

  it("isStale: missing symbol is stale", () => {
    const store = new FundamentalsStore();
    expect(store.isStale("FPT", 3600)).toBe(true);
  });

  it("isStale: ttl 0 → just-written row counts as stale boundary", () => {
    const store = new FundamentalsStore();
    store.set("FPT", sample("FPT"));
    // age is 0s; ttl -1 forces age > ttl → stale (boundary check)
    expect(store.isStale("FPT", -1)).toBe(true);
  });
});

describe("refresh", () => {
  it("refreshSymbol fetches then persists", async () => {
    const store = new FundamentalsStore();
    await refreshSymbol("FPT", store, async (s) => sample(s));
    expect(store.get("FPT")?.valuation.symbol).toBe("FPT");
  });

  it("refreshSymbols: a throwing symbol does not abort the batch", async () => {
    const store = new FundamentalsStore();
    const fetcher = async (s: string) => {
      if (s === "BAD") throw new Error("boom");
      return sample(s);
    };
    const warnings: string[] = [];
    const res = await refreshSymbols(["FPT", "BAD", "VCB"], store, {
      fetcher,
      logger: { info: () => {}, warn: (m) => warnings.push(m) },
      delayMs: 0,
    });
    expect(res).toEqual({ ok: 2, failed: 1 });
    expect(store.get("FPT")).not.toBeNull();
    expect(store.get("VCB")).not.toBeNull();
    expect(store.get("BAD")).toBeNull();
    expect(warnings[0]).toContain("BAD");
  });
});
