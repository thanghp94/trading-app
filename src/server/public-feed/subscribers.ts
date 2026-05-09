import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { Alert } from '../../shared/types.js';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.SUBSCRIBERS_DB_PATH ?? path.join(DB_DIR, 'subscribers.db');

export interface Subscriber {
  token: string;
  name: string;
  /** Comma-separated symbols this subscriber wants. Empty = all. */
  symbols: string;
  /** Comma-separated rule keys. Empty = all. */
  rules: string;
  created_at: number;
  /** Per-day rate limit. Default 200/day. */
  rate_limit_per_day: number;
  /** Today's count, reset on UTC day boundary. */
  used_today: number;
  used_today_date: string; // YYYY-MM-DD
}

/**
 * Public-feed subscribers — friends or allied accounts you want to share
 * your alerts with. Each gets a token; they hit GET /api/public/alerts?token=…
 * to poll, or open a WS to /public-ws?token=… for live push.
 *
 * Filter rules are simple substring/exact match on symbol + rule key.
 * Rate-limited per UTC day to prevent runaway abuse.
 */
export class SubscriberStore {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscribers (
        token TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        symbols TEXT NOT NULL DEFAULT '',
        rules TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        rate_limit_per_day INTEGER NOT NULL DEFAULT 200,
        used_today INTEGER NOT NULL DEFAULT 0,
        used_today_date TEXT NOT NULL DEFAULT ''
      );
    `);
  }

  list(): Subscriber[] {
    return this.db.prepare(`SELECT * FROM subscribers ORDER BY created_at DESC`).all() as Subscriber[];
  }

  create(name: string, opts: { symbols?: string; rules?: string; rateLimit?: number } = {}): Subscriber {
    const token = crypto.randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO subscribers (token, name, symbols, rules, created_at, rate_limit_per_day, used_today, used_today_date) VALUES (?, ?, ?, ?, ?, ?, 0, '')`,
      )
      .run(token, name, opts.symbols ?? '', opts.rules ?? '', now, opts.rateLimit ?? 200);
    return this.get(token)!;
  }

  delete(token: string): void {
    this.db.prepare(`DELETE FROM subscribers WHERE token = ?`).run(token);
  }

  get(token: string): Subscriber | null {
    return (this.db.prepare(`SELECT * FROM subscribers WHERE token = ?`).get(token) as Subscriber | undefined) ?? null;
  }

  /**
   * Returns true if the subscriber may receive this alert (filter match +
   * within today's quota). Increments usage counter on success.
   */
  consume(token: string, alert: Alert): boolean {
    const sub = this.get(token);
    if (!sub) return false;
    if (sub.symbols && !sub.symbols.split(',').map((s) => s.trim()).includes(alert.symbol)) return false;
    if (sub.rules && !sub.rules.split(',').map((s) => s.trim()).includes(alert.rule)) return false;

    const today = new Date().toISOString().slice(0, 10);
    let used = sub.used_today;
    if (sub.used_today_date !== today) used = 0;
    if (used >= sub.rate_limit_per_day) return false;
    this.db
      .prepare(`UPDATE subscribers SET used_today = ?, used_today_date = ? WHERE token = ?`)
      .run(used + 1, today, token);
    return true;
  }
}
