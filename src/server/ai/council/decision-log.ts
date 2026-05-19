import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { CouncilReport } from './types.js';

const DB_PATH = process.env.JOURNAL_DB_PATH ?? path.resolve(process.cwd(), 'data', 'journal.db');

/**
 * Appends AI Council decisions to the council_decisions table in journal.db.
 * Lazy-initialised on first append so server startup is never blocked.
 */
export class DecisionLog {
  private db: Database.Database | null = null;

  private open(): Database.Database {
    if (this.db) return this.db;
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS council_decisions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol      TEXT    NOT NULL,
        timeframe   TEXT    NOT NULL,
        raw_action  TEXT    NOT NULL,
        action      TEXT    NOT NULL,
        gated       INTEGER NOT NULL DEFAULT 0,
        confidence  TEXT    NOT NULL,
        size_pct    REAL    NOT NULL,
        tp          REAL    NOT NULL,
        sl          REAL    NOT NULL,
        rationale   TEXT    NOT NULL,
        cost_usd    REAL    NOT NULL,
        created_at  INTEGER NOT NULL
      )
    `);
    this.db = db;
    return db;
  }

  append(report: CouncilReport, rawAction: string): void {
    const db = this.open();
    db.prepare(`
      INSERT INTO council_decisions
        (symbol, timeframe, raw_action, action, gated, confidence, size_pct, tp, sl, rationale, cost_usd, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.symbol,
      report.timeframe,
      rawAction,
      report.pm.action,
      report.gated ? 1 : 0,
      report.pm.confidence,
      report.pm.sizePct,
      report.pm.tp,
      report.pm.sl,
      report.pm.rationale,
      report.cost.totalUsd,
      Math.floor(Date.now() / 1000),
    );
  }
}

export const decisionLog = new DecisionLog();
