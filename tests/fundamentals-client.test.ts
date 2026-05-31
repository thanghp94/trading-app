import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  mapFundamentals,
  fetchFundamentals,
  VnstockError,
} from "../src/server/fundamentals/vnstock-client.js";

const fixturePath = join(
  __dirname,
  "fixtures",
  "vnstock-fundamentals-fpt.json",
);
const fixture = readFileSync(fixturePath, "utf8");
const AS_OF = 1_700_000_000_000;

describe("mapFundamentals", () => {
  it("maps valuation snapshot from fixture", () => {
    const f = mapFundamentals(fixture, "FPT", AS_OF);
    expect(f.valuation.symbol).toBe("FPT");
    expect(f.valuation.asOf).toBe(AS_OF);
    expect(f.valuation.pe).toBeCloseTo(12.58, 1);
    expect(f.valuation.pb).toBeCloseTo(3.13, 1);
    expect(f.valuation.roe).toBeCloseTo(0.268, 2);
    expect(f.valuation.eps).toBe(1460);
    expect(f.valuation.marketCap).toBeGreaterThan(0);
    expect(f.valuation.dividendYield).toBe(0);
  });

  it("maps statements most-recent-first", () => {
    const f = mapFundamentals(fixture, "FPT", AS_OF);
    expect(f.statements.length).toBeGreaterThan(0);
    expect(f.statements[0].period).toBe("2026-Q1");
    expect(f.statements[0].revenue).toBeGreaterThan(0);
    expect(f.statements[0].totalAssets).toBeGreaterThan(0);
  });

  it("coerces missing/non-number fields to null", () => {
    const raw = JSON.stringify({
      valuation: { pe: 10, pb: null, roe: "bad", eps: 5 },
      statements: [{ period: "2025-Q1", revenue: 100 }],
    });
    const f = mapFundamentals(raw, "X", AS_OF);
    expect(f.valuation.pe).toBe(10);
    expect(f.valuation.pb).toBeNull();
    expect(f.valuation.roe).toBeNull(); // string → null
    expect(f.valuation.marketCap).toBeNull(); // absent → null
    expect(f.statements[0].grossProfit).toBeNull();
    expect(f.statements[0].revenue).toBe(100);
  });

  it("throws VnstockError on invalid JSON", () => {
    expect(() => mapFundamentals("not json", "X", AS_OF)).toThrow(VnstockError);
  });

  it("throws VnstockError on missing valuation key", () => {
    expect(() => mapFundamentals('{"statements":[]}', "X", AS_OF)).toThrow(
      VnstockError,
    );
  });
});

describe("fetchFundamentals (injected runner)", () => {
  it("maps fixture stdout from an injected runner", async () => {
    const f = await fetchFundamentals("fpt", async () => fixture);
    expect(f.valuation.symbol).toBe("FPT"); // uppercased
    expect(f.statements[0].period).toBe("2026-Q1");
  });

  it("throws on empty stdout", async () => {
    await expect(fetchFundamentals("X", async () => "  ")).rejects.toThrow(
      VnstockError,
    );
  });
});

// Live smoke: actually spawn the script. Skipped unless python + vnstock present.
const PYTHON = process.env.PYTHON_BIN ?? "pyvenv/bin/python";
const scriptPath = join(process.cwd(), "scripts", "vnstock-fundamentals.py");
function vnstockAvailable(): boolean {
  if (!existsSync(scriptPath)) return false;
  try {
    execFileSync(PYTHON, ["-c", "import vnstock"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!vnstockAvailable())("fetchFundamentals (live smoke)", () => {
  it("returns real fundamentals for a symbol", async () => {
    const f = await fetchFundamentals("FPT", (sym) =>
      Promise.resolve(
        execFileSync(PYTHON, [scriptPath, sym], {
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        }),
      ),
    );
    expect(f.valuation.symbol).toBe("FPT");
    expect(f.statements.length).toBeGreaterThan(0);
  }, 40_000);
});
