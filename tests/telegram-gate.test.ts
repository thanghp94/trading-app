import { describe, it, expect } from "vitest";
import {
  TelegramGate,
  formatDigest,
  type GateConfig,
} from "../src/server/alerts/telegram-gate.js";
import type { Alert } from "../src/shared/types.js";

const CFG: GateConfig = {
  minIntervalMs: 60_000,
  symbolCooldownMs: 1_800_000,
  highTierRules: new Set(["wave-3-entry", "wave-5-entry"]),
};

function alert(over: Partial<Alert> = {}): Alert {
  return {
    id: Math.random().toString(36).slice(2),
    rule: "wave-3-entry",
    symbol: "HPG",
    timeframe: "1d",
    time: 1_700_000_000,
    direction: "bull",
    price: 25,
    headline: "test",
    ...over,
  };
}

describe("TelegramGate", () => {
  it("sends high-tier entry rules live", () => {
    const g = new TelegramGate(CFG);
    expect(g.decide(alert(), 0).action).toBe("send");
  });

  it("buffers low-tier rules instead of sending", () => {
    const g = new TelegramGate(CFG);
    const d = g.decide(alert({ rule: "zone-touch" }), 0);
    expect(d.action).toBe("buffer");
    expect(d.tier).toBe("low");
    expect(g.bufferSize).toBe(1);
  });

  it("treats MTF-aligned low-tier rules as high tier", () => {
    const g = new TelegramGate(CFG);
    const d = g.decide(
      alert({
        rule: "zone-touch",
        meta: { mtfTrend: "aligned", mtfZone: "aligned" },
      }),
      0,
    );
    expect(d.action).toBe("send");
    expect(d.tier).toBe("high");
  });

  it("drops a repeat high-tier alert on the same symbol within cooldown", () => {
    const g = new TelegramGate(CFG);
    expect(g.decide(alert(), 0).action).toBe("send");
    const d = g.decide(alert(), 1000);
    expect(d.action).toBe("drop");
    expect(d.reason).toBe("symbol-cooldown");
  });

  it("buffers a high-tier alert when the global interval is too tight", () => {
    const g = new TelegramGate(CFG);
    expect(g.decide(alert({ symbol: "HPG" }), 0).action).toBe("send");
    // Different symbol (passes symbol cooldown) but inside global min-interval.
    const d = g.decide(alert({ symbol: "VIC" }), 5000);
    expect(d.action).toBe("buffer");
    expect(d.reason).toBe("global-throttle");
  });

  it("drainBuffer empties the buffer", () => {
    const g = new TelegramGate(CFG);
    g.decide(alert({ rule: "zone-touch" }), 0);
    g.decide(alert({ rule: "pattern-formed" }), 0);
    expect(g.drainBuffer()).toHaveLength(2);
    expect(g.bufferSize).toBe(0);
  });

  it("formatDigest summarizes buffered alerts", () => {
    const txt = formatDigest([
      alert({ symbol: "HPG" }),
      alert({ symbol: "VIC" }),
    ]);
    expect(txt).toContain("2 tín hiệu");
    expect(txt).toContain("HPG");
    expect(txt).toContain("VIC");
  });
});
