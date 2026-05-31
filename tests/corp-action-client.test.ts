import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  mapCorpActions,
  fetchCorpActions,
  CorpActionError,
} from "../src/server/fundamentals/corp-action-client.js";

const fixturePath = join(
  __dirname,
  "fixtures",
  "vnstock-corp-actions-fpt.json",
);
const fixture = readFileSync(fixturePath, "utf8");
const AS_OF = 1_700_000_000_000;

describe("mapCorpActions", () => {
  it("maps events from fixture, newest first", () => {
    const c = mapCorpActions(fixture, "FPT", AS_OF);
    expect(c.symbol).toBe("FPT");
    expect(c.asOf).toBe(AS_OF);
    expect(c.events.length).toBeGreaterThan(0);
    // dates are sorted descending by the script
    const dates = c.events.map((e) => e.date).filter(Boolean) as string[];
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it("maps a cash dividend with value + dates", () => {
    const c = mapCorpActions(fixture, "FPT", AS_OF);
    const div = c.events.find((e) => e.code === "DIV");
    expect(div).toBeTruthy();
    expect(div?.valuePerShare).toBeGreaterThan(0);
    expect(div?.exrightDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("coerces missing/non-number fields to null", () => {
    const raw = JSON.stringify({
      events: [{ code: "DIV", valuePerShare: "x", date: "2026-01-01" }],
    });
    const c = mapCorpActions(raw, "X", AS_OF);
    expect(c.events[0].code).toBe("DIV");
    expect(c.events[0].valuePerShare).toBeNull(); // string → null
    expect(c.events[0].exerciseRatio).toBeNull(); // absent → null
    expect(c.events[0].nameVi).toBeNull();
  });

  it("throws CorpActionError on invalid JSON", () => {
    expect(() => mapCorpActions("nope", "X", AS_OF)).toThrow(CorpActionError);
  });

  it("throws CorpActionError when events is not an array", () => {
    expect(() => mapCorpActions('{"events":{}}', "X", AS_OF)).toThrow(
      CorpActionError,
    );
  });
});

describe("fetchCorpActions (injected runner)", () => {
  it("maps fixture stdout + uppercases symbol", async () => {
    const c = await fetchCorpActions("fpt", async () => fixture);
    expect(c.symbol).toBe("FPT");
    expect(c.events.length).toBeGreaterThan(0);
  });

  it("throws on empty stdout", async () => {
    await expect(fetchCorpActions("X", async () => "")).rejects.toThrow(
      CorpActionError,
    );
  });
});

// Live smoke: spawn the real script. Skipped unless python + vnstock present.
const PYTHON = process.env.PYTHON_BIN ?? "pyvenv/bin/python";
const scriptPath = join(process.cwd(), "scripts", "vnstock-corp-actions.py");
function vnstockAvailable(): boolean {
  if (!existsSync(scriptPath)) return false;
  try {
    execFileSync(PYTHON, ["-c", "import vnstock"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!vnstockAvailable())("fetchCorpActions (live smoke)", () => {
  it("returns real events for a symbol", async () => {
    const c = await fetchCorpActions("FPT", (sym) =>
      Promise.resolve(
        execFileSync(PYTHON, [scriptPath, sym], {
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        }),
      ),
    );
    expect(c.symbol).toBe("FPT");
    expect(c.events.length).toBeGreaterThan(0);
  }, 40_000);
});
