import type { Alert } from "../../shared/types.js";

/**
 * Telegram urgency gate — stops notification spam by deciding, per alert,
 * whether to push it live to the phone or batch it into a periodic digest.
 *
 * Two-tier model:
 *   - HIGH tier (entry signals, or alerts whose MTF context is fully aligned)
 *     interrupt live — but still respect a per-symbol cooldown so the same
 *     symbol can't hammer the phone, and a global min-interval between sends.
 *   - LOW tier (zone touches, pattern reforms, unaligned setups) never
 *     interrupt; they accumulate and flush as one batched digest message.
 *
 * Per-rule cooldown already exists upstream (rule-evaluator). This gate adds
 * the missing *aggregate* throttle across all rules/symbols/timeframes.
 */

export interface GateConfig {
  /** Min gap between any two live sends (ms). */
  minIntervalMs: number;
  /** Per-symbol live cooldown (ms) — one live push per symbol per window. */
  symbolCooldownMs: number;
  /** Rule keys that always qualify as HIGH tier. */
  highTierRules: Set<string>;
}

export type GateAction = "send" | "buffer" | "drop";

export interface GateDecision {
  action: GateAction;
  tier: "high" | "low";
  reason?: string;
}

export class TelegramGate {
  private lastSentAt = -Infinity;
  private lastSymbolAt = new Map<string, number>();
  private buffer: Alert[] = [];

  constructor(private cfg: GateConfig) {}

  private isHighTier(alert: Alert): boolean {
    if (this.cfg.highTierRules.has(alert.rule)) return true;
    // MTF context is stamped onto alert.meta in broadcastAlert before this runs.
    const trend = alert.meta?.mtfTrend;
    const zone = alert.meta?.mtfZone;
    return trend === "aligned" && zone === "aligned";
  }

  /**
   * Decide what to do with an alert. Buffered alerts are retrievable via
   * drainBuffer() for the digest flush. Pass `now` for deterministic tests.
   */
  decide(alert: Alert, now: number = Date.now()): GateDecision {
    if (!this.isHighTier(alert)) {
      this.buffer.push(alert);
      return { action: "buffer", tier: "low" };
    }

    const lastSym = this.lastSymbolAt.get(alert.symbol) ?? -Infinity;
    if (now - lastSym < this.cfg.symbolCooldownMs) {
      return { action: "drop", tier: "high", reason: "symbol-cooldown" };
    }
    if (now - this.lastSentAt < this.cfg.minIntervalMs) {
      // Globally throttled — buffer rather than drop so the signal isn't lost.
      this.buffer.push(alert);
      return { action: "buffer", tier: "high", reason: "global-throttle" };
    }

    this.lastSentAt = now;
    this.lastSymbolAt.set(alert.symbol, now);
    return { action: "send", tier: "high" };
  }

  /** Remove and return buffered alerts (for digest flush). */
  drainBuffer(): Alert[] {
    const drained = this.buffer;
    this.buffer = [];
    return drained;
  }

  get bufferSize(): number {
    return this.buffer.length;
  }
}

/** Build one batched digest message from buffered alerts. */
export function formatDigest(alerts: Alert[]): string {
  const header = `🔕 *${alerts.length} tín hiệu chờ* (gom nhóm)\n`;
  const lines = alerts.slice(0, 40).map((a) => {
    const arrow = a.direction === "bull" ? "🟢" : "🔴";
    return `${arrow} ${a.symbol} ${a.timeframe} · ${a.rule} @ \`${a.price}\``;
  });
  const more =
    alerts.length > 40 ? `\n…và ${alerts.length - 40} tín hiệu khác` : "";
  return header + "\n" + lines.join("\n") + more;
}

/** Parse gate config from env with sane spam-cutting defaults. */
export function gateConfigFromEnv(env: NodeJS.ProcessEnv): GateConfig {
  const highTier = (env.TELEGRAM_HIGH_TIER_RULES ?? "wave-3-entry,wave-5-entry")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    minIntervalMs: Number(env.TELEGRAM_MIN_INTERVAL_SEC ?? 60) * 1000,
    symbolCooldownMs: Number(env.TELEGRAM_SYMBOL_COOLDOWN_SEC ?? 1800) * 1000,
    highTierRules: new Set(highTier),
  };
}
