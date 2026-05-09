import type { JournalStore } from './store.js';

interface RiskGuardConfig {
  /** Max consecutive losing trades today before alerts pause. 0 = disabled. */
  maxLossesPerDay: number;
  /** Max negative R sum today before alerts pause. 0 = disabled. */
  maxDrawdownR: number;
}

/**
 * Risk-management guards. Read journal state and decide whether to suppress
 * outbound alerts because the user has hit their daily loss limit or
 * drawdown threshold. "Saves you from yourself" — the design-doc-mandated
 * stretch.
 *
 * Triggered on every alert fire; guards are pure functions of the
 * journal's current state.
 */
export class RiskGuards {
  private cfg: RiskGuardConfig;

  constructor(private journal: JournalStore) {
    this.cfg = {
      maxLossesPerDay: numEnv('MAX_LOSSES_PER_DAY', 0),
      maxDrawdownR: numEnv('MAX_DRAWDOWN_R', 0),
    };
  }

  /** Returns null if alerts may proceed, or a string reason if blocked. */
  check(): string | null {
    if (this.cfg.maxLossesPerDay === 0 && this.cfg.maxDrawdownR === 0) return null;

    const today = new Date().toISOString().slice(0, 10);
    const trades = this.journal.list(500).filter((t) => {
      if (!t.closed_at) return false;
      return new Date(t.closed_at * 1000).toISOString().slice(0, 10) === today;
    });

    const losses = trades.filter((t) => t.outcome === 'loss').length;
    const rSum = trades.reduce((acc, t) => acc + (t.r_multiple ?? 0), 0);

    if (this.cfg.maxLossesPerDay > 0 && losses >= this.cfg.maxLossesPerDay) {
      return `daily loss limit reached (${losses}/${this.cfg.maxLossesPerDay} losses today)`;
    }
    if (this.cfg.maxDrawdownR > 0 && -rSum >= this.cfg.maxDrawdownR) {
      return `daily drawdown limit reached (${rSum.toFixed(2)}R, threshold -${this.cfg.maxDrawdownR}R)`;
    }
    return null;
  }
}

function numEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
