import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { BacktestRequest, BacktestResult } from './backtest-engine.js';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.BACKTEST_DB_PATH ?? path.join(DB_DIR, 'backtest-runs.db');

export interface RunRow {
  id: string;
  label: string;
  symbol: string;
  timeframe: string;
  from_date: string | null;
  to_date: string | null;
  config_json: string;
  stats_json: string;
  total: number;
  win_rate: number;
  sum_r: number;
  pnl_pct: number;
  max_dd_pct: number;
  total_fees: number;
  created_at: number;
}

export interface SavedRun {
  id: string;
  label: string;
  symbol: string;
  timeframe: string;
  fromDate: string | null;
  toDate: string | null;
  config: Partial<BacktestRequest>;
  stats: BacktestResult['stats'];
  createdAt: number;
}

/**
 * SQLite-backed store for saved backtest runs. Persists config + stats only
 * (no per-trade detail, no candles) — keeps DB tiny and lets users diff
 * dozens of runs without re-running.
 */
export class BacktestRunStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        from_date TEXT,
        to_date TEXT,
        config_json TEXT NOT NULL,
        stats_json TEXT NOT NULL,
        total INTEGER NOT NULL,
        win_rate REAL NOT NULL,
        sum_r REAL NOT NULL,
        pnl_pct REAL NOT NULL,
        max_dd_pct REAL NOT NULL,
        total_fees REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_symbol ON runs(symbol);
      CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
    `);
  }

  save(args: {
    label: string;
    fromDate?: string | null;
    toDate?: string | null;
    config: Partial<BacktestRequest>;
    result: BacktestResult;
  }): SavedRun {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Math.floor(Date.now() / 1000);
    const { result, config } = args;
    this.db
      .prepare(
        `INSERT INTO runs
         (id, label, symbol, timeframe, from_date, to_date, config_json, stats_json,
          total, win_rate, sum_r, pnl_pct, max_dd_pct, total_fees, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        args.label,
        result.symbol,
        result.timeframe,
        args.fromDate ?? null,
        args.toDate ?? null,
        JSON.stringify(config),
        JSON.stringify(result.stats),
        result.stats.total,
        result.stats.winRate,
        result.stats.sumR,
        result.stats.pnlPct,
        result.stats.maxDrawdownPct,
        result.stats.totalFees ?? 0,
        now,
      );
    return {
      id,
      label: args.label,
      symbol: result.symbol,
      timeframe: result.timeframe,
      fromDate: args.fromDate ?? null,
      toDate: args.toDate ?? null,
      config,
      stats: result.stats,
      createdAt: now,
    };
  }

  list(limit = 50): SavedRun[] {
    const rows = this.db
      .prepare<[number], RunRow>(`SELECT * FROM runs ORDER BY created_at DESC LIMIT ?`)
      .all(limit);
    return rows.map(rowToSaved);
  }

  get(id: string): SavedRun | null {
    const row = this.db
      .prepare<[string], RunRow>(`SELECT * FROM runs WHERE id = ?`)
      .get(id);
    return row ? rowToSaved(row) : null;
  }

  delete(id: string): boolean {
    const r = this.db.prepare(`DELETE FROM runs WHERE id = ?`).run(id);
    return r.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}

function rowToSaved(r: RunRow): SavedRun {
  return {
    id: r.id,
    label: r.label,
    symbol: r.symbol,
    timeframe: r.timeframe,
    fromDate: r.from_date,
    toDate: r.to_date,
    config: JSON.parse(r.config_json) as Partial<BacktestRequest>,
    stats: JSON.parse(r.stats_json) as BacktestResult['stats'],
    createdAt: r.created_at,
  };
}
