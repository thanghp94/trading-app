import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CorpActionStore } from "../src/server/fundamentals/corp-action-store.js";
import { registerSymbolCacheRoute } from "../src/server/fundamentals/route.js";
import { refreshSymbol } from "../src/server/fundamentals/refresh.js";
import type { CorpActionCalendar } from "../src/server/fundamentals/corp-action-types.js";

let tmpDir: string;
let app: FastifyInstance;

function sample(symbol: string): CorpActionCalendar {
  return {
    symbol,
    events: [
      {
        code: "DIV",
        category: "DIVIDEND",
        nameVi: "Trả cổ tức bằng tiền mặt",
        nameEn: "Cash Dividend",
        titleVi: "Cổ tức Đợt 2 2025 - 1,000 VND",
        titleEn: "Cash Dividend - Interim 2 2025",
        date: "2026-05-28",
        publicDate: "2026-05-22",
        recordDate: "2026-05-29",
        exrightDate: "2026-05-28",
        payoutDate: "2026-06-10",
        valuePerShare: 1000,
        exerciseRatio: 0.1,
      },
    ],
    asOf: 1_700_000_000_000,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "corp-action-test-"));
  process.env.JOURNAL_DB_PATH = join(tmpDir, "test.db");
  app = Fastify();
});

afterEach(async () => {
  await app.close();
  delete process.env.JOURNAL_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("CorpActionStore", () => {
  it("missing symbol → null", () => {
    expect(new CorpActionStore().get("NONE")).toBeNull();
  });

  it("set→get round-trip preserves events", () => {
    const store = new CorpActionStore();
    store.set("FPT", sample("FPT"));
    const got = store.get("FPT");
    expect(got?.events).toHaveLength(1);
    expect(got?.events[0].code).toBe("DIV");
    expect(got?.events[0].valuePerShare).toBe(1000);
  });

  it("isStale: fresh not stale, missing stale", () => {
    const store = new CorpActionStore();
    store.set("FPT", sample("FPT"));
    expect(store.isStale("FPT", 3600)).toBe(false);
    expect(store.isStale("VCB", 3600)).toBe(true);
  });

  it("refreshSymbol persists via injected fetcher", async () => {
    const store = new CorpActionStore();
    await refreshSymbol("FPT", store, async (s) => sample(s));
    expect(store.get("FPT")?.symbol).toBe("FPT");
  });
});

describe("GET /api/corp-actions/:symbol (generic route)", () => {
  it("fresh cache hit returns stored payload (no fetch)", async () => {
    const store = new CorpActionStore();
    store.set("FPT", sample("FPT"));
    let fetched = false;
    registerSymbolCacheRoute(app, {
      path: "/api/corp-actions/:symbol",
      label: "corp-actions",
      store,
      ttlSec: 3600,
      fetcher: async (s) => {
        fetched = true;
        return sample(s);
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/corp-actions/fpt",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().events[0].code).toBe("DIV");
    expect(fetched).toBe(false);
  });

  it("cache miss fetches on demand + persists", async () => {
    const store = new CorpActionStore();
    registerSymbolCacheRoute(app, {
      path: "/api/corp-actions/:symbol",
      label: "corp-actions",
      store,
      ttlSec: 3600,
      fetcher: async (s) => sample(s),
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/corp-actions/VCB",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().symbol).toBe("VCB");
    expect(store.get("VCB")).not.toBeNull();
  });
});
