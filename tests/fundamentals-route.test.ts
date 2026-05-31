import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FundamentalsStore } from "../src/server/fundamentals/fundamentals-store.js";
import { registerSymbolCacheRoute } from "../src/server/fundamentals/route.js";
import type { Fundamentals } from "../src/server/fundamentals/types.js";

let tmpDir: string;
let app: FastifyInstance;

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

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "fundamentals-route-test-"));
  process.env.JOURNAL_DB_PATH = join(tmpDir, "test.db");
  app = Fastify();
});

afterEach(async () => {
  await app.close();
  delete process.env.JOURNAL_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /api/fundamentals/:symbol", () => {
  it("returns stored payload on a fresh cache hit (no fetch)", async () => {
    const store = new FundamentalsStore();
    store.set("FPT", sample("FPT"));
    let fetched = false;
    registerSymbolCacheRoute(app, {
      path: "/api/fundamentals/:symbol",
      label: "fundamentals",
      store,
      ttlSec: 3600,
      fetcher: async (s) => {
        fetched = true;
        return sample(s);
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/fundamentals/fpt",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valuation.pe).toBe(12.5);
    expect(fetched).toBe(false);
  });

  it("cache miss triggers on-demand fetch then returns + persists", async () => {
    const store = new FundamentalsStore();
    registerSymbolCacheRoute(app, {
      path: "/api/fundamentals/:symbol",
      label: "fundamentals",
      store,
      ttlSec: 3600,
      fetcher: async (s) => sample(s),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/fundamentals/VCB",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valuation.symbol).toBe("VCB");
    expect(store.get("VCB")).not.toBeNull(); // persisted
  });

  it("rejects a malformed symbol with 400 (no fetch)", async () => {
    const store = new FundamentalsStore();
    let fetched = false;
    registerSymbolCacheRoute(app, {
      path: "/api/fundamentals/:symbol",
      label: "fundamentals",
      store,
      ttlSec: 3600,
      fetcher: async (s) => {
        fetched = true;
        return sample(s);
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/fundamentals/not_a_symbol!",
    });
    expect(res.statusCode).toBe(400);
    expect(fetched).toBe(false);
  });

  it("upstream failure with no cache → 502", async () => {
    const store = new FundamentalsStore();
    registerSymbolCacheRoute(app, {
      path: "/api/fundamentals/:symbol",
      label: "fundamentals",
      store,
      ttlSec: 3600,
      fetcher: async () => {
        throw new Error("vnstock down");
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/fundamentals/XYZ",
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBeTruthy();
  });

  it("stale cache + upstream failure → serves stale", async () => {
    const store = new FundamentalsStore();
    store.set("FPT", sample("FPT"));
    registerSymbolCacheRoute(app, {
      path: "/api/fundamentals/:symbol",
      label: "fundamentals",
      store,
      ttlSec: -1, // force stale
      fetcher: async () => {
        throw new Error("vnstock down");
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/fundamentals/FPT",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valuation.pe).toBe(12.5); // served stale
  });
});
