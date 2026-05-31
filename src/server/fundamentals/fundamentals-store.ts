import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Fundamentals } from "./types.js";

/** SQLite cache for fundamentals (they change quarterly → cache hard, refresh rarely). */
export class FundamentalsStore {
  private db: Database.Database;

  constructor() {
    const DB_DIR = path.resolve(process.cwd(), "data");
    const DB_PATH =
      process.env.JOURNAL_DB_PATH ?? path.join(DB_DIR, "journal.db");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fundamentals (
        symbol     TEXT PRIMARY KEY,
        payload    TEXT NOT NULL,
        fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  }

  /** Parsed fundamentals for a symbol, or null when absent. */
  get(symbol: string): Fundamentals | null {
    const row = this.db
      .prepare("SELECT payload FROM fundamentals WHERE symbol = ?")
      .get(symbol.toUpperCase()) as { payload: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as Fundamentals;
    } catch {
      return null;
    }
  }

  /** Upsert fundamentals + stamp fetched_at (seconds). */
  set(symbol: string, fundamentals: Fundamentals): void {
    this.db
      .prepare(
        `INSERT INTO fundamentals (symbol, payload, fetched_at)
         VALUES (?, ?, unixepoch())
         ON CONFLICT(symbol) DO UPDATE SET
           payload = excluded.payload,
           fetched_at = excluded.fetched_at`,
      )
      .run(symbol.toUpperCase(), JSON.stringify(fundamentals));
  }

  /** Seconds since the symbol was cached, or null if never cached. */
  ageSec(symbol: string): number | null {
    const row = this.db
      .prepare("SELECT fetched_at FROM fundamentals WHERE symbol = ?")
      .get(symbol.toUpperCase()) as { fetched_at: number } | undefined;
    if (!row) return null;
    return Math.floor(Date.now() / 1000) - row.fetched_at;
  }

  /** True when missing or older than ttlSec (so it should be refreshed). */
  isStale(symbol: string, ttlSec: number): boolean {
    const age = this.ageSec(symbol);
    return age === null || age > ttlSec;
  }
}
