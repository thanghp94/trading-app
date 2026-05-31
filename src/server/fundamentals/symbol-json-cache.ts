import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * Generic symbol-keyed JSON cache backed by SQLite (one table per domain:
 * fundamentals, ownership, corp_events …). Each row is a `{symbol, payload,
 * fetched_at}` blob; payloads change slowly so the cache is served hard and
 * refreshed nightly + on cache-miss. Shares the `JOURNAL_DB_PATH` convention
 * used across the app's stores.
 */
export class SymbolJsonCache<T> {
  private db: Database.Database;

  constructor(private readonly table: string) {
    // Table name is interpolated into DDL — only internal constants are passed,
    // but guard anyway so a bad name can never become an injection vector.
    if (!/^[a-z_]+$/.test(table)) {
      throw new Error(`invalid cache table name: ${table}`);
    }
    const DB_DIR = path.resolve(process.cwd(), "data");
    const DB_PATH =
      process.env.JOURNAL_DB_PATH ?? path.join(DB_DIR, "journal.db");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        symbol     TEXT PRIMARY KEY,
        payload    TEXT NOT NULL,
        fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  }

  /** Parsed payload for a symbol, or null when absent / corrupt. */
  get(symbol: string): T | null {
    const row = this.db
      .prepare(`SELECT payload FROM ${this.table} WHERE symbol = ?`)
      .get(symbol.toUpperCase()) as { payload: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as T;
    } catch {
      return null;
    }
  }

  /** Upsert payload + stamp fetched_at (seconds). */
  set(symbol: string, data: T): void {
    this.db
      .prepare(
        `INSERT INTO ${this.table} (symbol, payload, fetched_at)
         VALUES (?, ?, unixepoch())
         ON CONFLICT(symbol) DO UPDATE SET
           payload = excluded.payload,
           fetched_at = excluded.fetched_at`,
      )
      .run(symbol.toUpperCase(), JSON.stringify(data));
  }

  /** Seconds since the symbol was cached, or null if never cached. */
  ageSec(symbol: string): number | null {
    const row = this.db
      .prepare(`SELECT fetched_at FROM ${this.table} WHERE symbol = ?`)
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
