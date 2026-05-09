import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { Alert } from '../../shared/types.js';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.JOURNAL_DB_PATH ?? path.join(DB_DIR, 'journal.db');

export type TradeOutcome = 'open' | 'win' | 'loss' | 'breakeven' | 'cancelled';

export interface TradeRow {
  id: string;
  alert_id: string | null;
  symbol: string;
  timeframe: string;
  direction: 'bull' | 'bear';
  rule: string | null;
  entry_price: number;
  sl: number | null;
  tp: number | null;
  exit_price: number | null;
  outcome: TradeOutcome;
  r_multiple: number | null;
  notes: string | null;
  opened_at: number; // unix sec
  closed_at: number | null;
}

/**
 * SQLite-backed trade journal. WAL mode for safe concurrent reads/writes.
 *
 * Schema:
 *   trades(id pk, alert_id, symbol, timeframe, direction, rule,
 *          entry_price, sl, tp, exit_price, outcome, r_multiple, notes,
 *          opened_at, closed_at)
 *
 * On every alert that fires, we auto-create a row with outcome='open'
 * and entry_price = bar close at fire time. The user later updates SL/TP/
 * exit/outcome via the UI or REST.
 */
export class JournalStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        alert_id TEXT,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        direction TEXT NOT NULL,
        rule TEXT,
        entry_price REAL NOT NULL,
        sl REAL,
        tp REAL,
        exit_price REAL,
        outcome TEXT NOT NULL DEFAULT 'open',
        r_multiple REAL,
        notes TEXT,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_trades_opened_at ON trades(opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_trades_outcome ON trades(outcome);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_alert ON trades(alert_id) WHERE alert_id IS NOT NULL;
    `);
  }

  /** Auto-log a fired alert as an "open" trade. Idempotent on alert_id. */
  logFromAlert(alert: Alert): TradeRow | null {
    const id = `t_${alert.id}`;
    try {
      this.db
        .prepare(
          `INSERT INTO trades (id, alert_id, symbol, timeframe, direction, rule, entry_price, outcome, opened_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        )
        .run(id, alert.id, alert.symbol, alert.timeframe, alert.direction, alert.rule, alert.price, alert.time);
      return this.get(id);
    } catch (err) {
      // Unique constraint violation → already logged; that's fine.
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return this.getByAlertId(alert.id);
      }
      throw err;
    }
  }

  list(limit = 100): TradeRow[] {
    return this.db
      .prepare(`SELECT * FROM trades ORDER BY opened_at DESC LIMIT ?`)
      .all(limit) as TradeRow[];
  }

  get(id: string): TradeRow | null {
    return (this.db.prepare(`SELECT * FROM trades WHERE id = ?`).get(id) as TradeRow | undefined) ?? null;
  }

  getByAlertId(alertId: string): TradeRow | null {
    return (this.db.prepare(`SELECT * FROM trades WHERE alert_id = ?`).get(alertId) as TradeRow | undefined) ?? null;
  }

  /** Update mutable fields. Computes r_multiple if entry+sl+exit are known. */
  update(id: string, patch: Partial<Pick<TradeRow, 'sl' | 'tp' | 'exit_price' | 'outcome' | 'notes' | 'closed_at'>>): TradeRow | null {
    const existing = this.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };

    if (next.outcome !== 'open' && next.closed_at == null) {
      next.closed_at = Math.floor(Date.now() / 1000);
    }
    if (next.entry_price != null && next.sl != null && next.exit_price != null) {
      const risk = Math.abs(next.entry_price - next.sl);
      if (risk > 0) {
        const reward = next.direction === 'bull' ? next.exit_price - next.entry_price : next.entry_price - next.exit_price;
        next.r_multiple = reward / risk;
      }
    }

    this.db
      .prepare(
        `UPDATE trades SET sl=?, tp=?, exit_price=?, outcome=?, notes=?, closed_at=?, r_multiple=? WHERE id=?`,
      )
      .run(next.sl, next.tp, next.exit_price, next.outcome, next.notes, next.closed_at, next.r_multiple, id);
    return this.get(id);
  }

  stats(): { total: number; wins: number; losses: number; breakeven: number; open: number; avgR: number } {
    const rows = this.db
      .prepare(`SELECT outcome, r_multiple FROM trades`)
      .all() as Array<{ outcome: TradeOutcome; r_multiple: number | null }>;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let open = 0;
    let rSum = 0;
    let rCount = 0;
    for (const r of rows) {
      if (r.outcome === 'win') wins += 1;
      else if (r.outcome === 'loss') losses += 1;
      else if (r.outcome === 'breakeven') breakeven += 1;
      else if (r.outcome === 'open') open += 1;
      if (r.r_multiple != null && Number.isFinite(r.r_multiple)) {
        rSum += r.r_multiple;
        rCount += 1;
      }
    }
    return { total: rows.length, wins, losses, breakeven, open, avgR: rCount > 0 ? rSum / rCount : 0 };
  }
}
