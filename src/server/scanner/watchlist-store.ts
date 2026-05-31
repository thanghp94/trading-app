import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Timeframe } from "../../shared/types.js";

export interface WatchedSymbol {
  symbol: string;
  timeframe: Timeframe;
  addedAt: number;
}

/** Persists pinned watchlist symbols so they survive server restarts. */
export class WatchlistStore {
  private db: Database.Database;

  constructor() {
    const DB_DIR = path.resolve(process.cwd(), "data");
    const DB_PATH =
      process.env.JOURNAL_DB_PATH ?? path.join(DB_DIR, "journal.db");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        symbol    TEXT NOT NULL PRIMARY KEY,
        timeframe TEXT NOT NULL DEFAULT '1d',
        added_at  INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  }

  list(): WatchedSymbol[] {
    return this.db
      .prepare(
        "SELECT symbol, timeframe, added_at AS addedAt FROM watchlist ORDER BY added_at DESC",
      )
      .all() as WatchedSymbol[];
  }

  /** Add one or many symbols (comma-separated or array). Silently ignores duplicates. */
  add(
    symbols: string | string[],
    timeframe: Timeframe = "1d",
  ): WatchedSymbol[] {
    const list = Array.isArray(symbols)
      ? symbols
      : symbols
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);

    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO watchlist (symbol, timeframe) VALUES (?, ?)",
    );
    const insert = this.db.transaction(() => {
      for (const sym of list) stmt.run(sym, timeframe);
    });
    insert();
    return this.list();
  }

  remove(symbol: string): void {
    this.db.prepare("DELETE FROM watchlist WHERE symbol = ?").run(symbol);
  }

  clear(): void {
    this.db.prepare("DELETE FROM watchlist").run();
  }
}
