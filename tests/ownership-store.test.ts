import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OwnershipStore } from "../src/server/fundamentals/ownership-store.js";
import { registerSymbolCacheRoute } from "../src/server/fundamentals/route.js";
import { refreshSymbol } from "../src/server/fundamentals/refresh.js";
import type { Ownership } from "../src/server/fundamentals/ownership-types.js";

let tmpDir: string;
let app: FastifyInstance;

function sample(symbol: string): Ownership {
  return {
    symbol,
    structure: { foreignPct: 0.28, statePct: 0.05, freeFloatPct: 0.85 },
    shareholders: [
      {
        name: "Trương Gia Bình",
        quantity: 117347966,
        pct: 0.0689,
        asOf: "2026-02-03",
      },
    ],
    officers: [
      {
        name: "Trương Gia Bình",
        position: "Chủ tịch HĐQT",
        quantity: 117347966,
        pct: 0.0689,
      },
    ],
    asOf: 1_700_000_000_000,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ownership-test-"));
  process.env.JOURNAL_DB_PATH = join(tmpDir, "test.db");
  app = Fastify();
});

afterEach(async () => {
  await app.close();
  delete process.env.JOURNAL_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("OwnershipStore", () => {
  it("missing symbol → null", () => {
    expect(new OwnershipStore().get("NONE")).toBeNull();
  });

  it("set→get round-trip preserves payload", () => {
    const store = new OwnershipStore();
    store.set("FPT", sample("FPT"));
    const got = store.get("FPT");
    expect(got?.structure.foreignPct).toBe(0.28);
    expect(got?.shareholders[0].name).toBe("Trương Gia Bình");
    expect(got?.officers).toHaveLength(1);
  });

  it("isStale: fresh not stale, missing stale", () => {
    const store = new OwnershipStore();
    store.set("FPT", sample("FPT"));
    expect(store.isStale("FPT", 3600)).toBe(false);
    expect(store.isStale("VCB", 3600)).toBe(true);
  });

  it("refreshSymbol persists via injected fetcher", async () => {
    const store = new OwnershipStore();
    await refreshSymbol("FPT", store, async (s) => sample(s));
    expect(store.get("FPT")?.symbol).toBe("FPT");
  });
});

describe("GET /api/ownership/:symbol (generic route)", () => {
  it("fresh cache hit returns stored payload (no fetch)", async () => {
    const store = new OwnershipStore();
    store.set("FPT", sample("FPT"));
    let fetched = false;
    registerSymbolCacheRoute(app, {
      path: "/api/ownership/:symbol",
      label: "ownership",
      store,
      ttlSec: 3600,
      fetcher: async (s) => {
        fetched = true;
        return sample(s);
      },
    });
    const res = await app.inject({ method: "GET", url: "/api/ownership/fpt" });
    expect(res.statusCode).toBe(200);
    expect(res.json().structure.foreignPct).toBe(0.28);
    expect(fetched).toBe(false);
  });

  it("cache miss fetches on demand + persists", async () => {
    const store = new OwnershipStore();
    registerSymbolCacheRoute(app, {
      path: "/api/ownership/:symbol",
      label: "ownership",
      store,
      ttlSec: 3600,
      fetcher: async (s) => sample(s),
    });
    const res = await app.inject({ method: "GET", url: "/api/ownership/VCB" });
    expect(res.statusCode).toBe(200);
    expect(res.json().symbol).toBe("VCB");
    expect(store.get("VCB")).not.toBeNull();
  });
});
