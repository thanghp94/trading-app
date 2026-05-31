import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  mapOwnership,
  fetchOwnership,
  OwnershipError,
} from "../src/server/fundamentals/ownership-client.js";

const fixturePath = join(__dirname, "fixtures", "vnstock-ownership-fpt.json");
const fixture = readFileSync(fixturePath, "utf8");
const AS_OF = 1_700_000_000_000;

describe("mapOwnership", () => {
  it("maps structure + shareholders + officers from fixture", () => {
    const o = mapOwnership(fixture, "FPT", AS_OF);
    expect(o.symbol).toBe("FPT");
    expect(o.asOf).toBe(AS_OF);
    expect(o.structure.foreignPct).toBeGreaterThan(0);
    expect(o.structure.freeFloatPct).toBeGreaterThan(0);
    expect(o.shareholders.length).toBeGreaterThan(0);
    expect(o.shareholders[0].name).toBeTruthy();
    expect(o.shareholders[0].pct).toBeGreaterThan(0);
    expect(o.officers.length).toBeGreaterThan(0);
    expect(o.officers[0].position).toBeTruthy();
  });

  it("coerces missing/non-number fields to null", () => {
    const raw = JSON.stringify({
      structure: { foreignPct: 0.2, statePct: "bad" },
      shareholders: [{ name: "X" }],
      officers: [{ name: "Y", position: "CEO" }],
    });
    const o = mapOwnership(raw, "X", AS_OF);
    expect(o.structure.foreignPct).toBe(0.2);
    expect(o.structure.statePct).toBeNull(); // string → null
    expect(o.structure.freeFloatPct).toBeNull(); // absent → null
    expect(o.shareholders[0].quantity).toBeNull();
    expect(o.officers[0].pct).toBeNull();
  });

  it("throws OwnershipError on invalid JSON", () => {
    expect(() => mapOwnership("nope", "X", AS_OF)).toThrow(OwnershipError);
  });

  it("throws OwnershipError on missing structure key", () => {
    expect(() => mapOwnership('{"shareholders":[]}', "X", AS_OF)).toThrow(
      OwnershipError,
    );
  });
});

describe("fetchOwnership (injected runner)", () => {
  it("maps fixture stdout + uppercases symbol", async () => {
    const o = await fetchOwnership("fpt", async () => fixture);
    expect(o.symbol).toBe("FPT");
    expect(o.shareholders.length).toBeGreaterThan(0);
  });

  it("throws on empty stdout", async () => {
    await expect(fetchOwnership("X", async () => "")).rejects.toThrow(
      OwnershipError,
    );
  });
});

// Live smoke: spawn the real script. Skipped unless python + vnstock present.
const PYTHON = process.env.PYTHON_BIN ?? "pyvenv/bin/python";
const scriptPath = join(process.cwd(), "scripts", "vnstock-ownership.py");
function vnstockAvailable(): boolean {
  if (!existsSync(scriptPath)) return false;
  try {
    execFileSync(PYTHON, ["-c", "import vnstock"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!vnstockAvailable())("fetchOwnership (live smoke)", () => {
  it("returns real ownership for a symbol", async () => {
    const o = await fetchOwnership("FPT", (sym) =>
      Promise.resolve(
        execFileSync(PYTHON, [scriptPath, sym], {
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        }),
      ),
    );
    expect(o.symbol).toBe("FPT");
    expect(o.shareholders.length).toBeGreaterThan(0);
  }, 40_000);
});
