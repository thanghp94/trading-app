# Phase 02: SQLite Cache + Nightly Refresh

**Priority:** High | **Status:** Done | **Effort:** Medium
**Depends on:** Phase 01

## Overview

Cache fundamentals in SQLite (they change quarterly) so the request path is near-zero
latency and the python subprocess runs rarely (cache-miss + nightly only). Nightly cron
refreshes the watchlist set.

<!-- Updated: Validation Session 1 — source is vnstock-client (python CLI), not a TCBS HTTP client -->
**Source dependency:** `refresh` calls `fetchFundamentals` from Phase 01's `vnstock-client.ts`
(spawns python). Inject it for tests.

## Files to Create

- `src/server/fundamentals/fundamentals-store.ts` — SQLite cache (mirror `watchlist-store.ts`)
- `src/server/fundamentals/refresh.ts` — refresh one symbol / the watchlist set
- `tests/fundamentals-store.test.ts` — cache get/set/staleness + refresh logic

## Files to Modify

- `src/server/index.ts` — register nightly refresh cron (reuse `node-cron`, mirror 15:15 digest cron)

## Store design

- Same `better-sqlite3` + `JOURNAL_DB_PATH` convention as `watchlist-store.ts`.
- Table `fundamentals` keyed by `symbol`, stores the `Fundamentals` JSON blob + `fetched_at`.
  ```sql
  CREATE TABLE IF NOT EXISTS fundamentals (
    symbol     TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,        -- JSON Fundamentals
    fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  ```
- `get(symbol)` → parsed `Fundamentals | null`; `isStale(symbol, ttlSec)` helper.
- `set(symbol, fundamentals)` → upsert + stamp `fetched_at`.

## Refresh design

- `refreshSymbol(sym)`: client fetch → `store.set`. Swallow + log per-symbol errors
  (one bad symbol must not abort the batch).
- `refreshWatchlist()`: iterate `WatchlistStore.list()` symbols, sequential with small
  delay (politeness vs TCBS); summary-log count succeeded/failed.
- Cron: nightly (e.g. `30 16 * * 1-5`, after VN close + digest) → `refreshWatchlist()`.

## Implementation Steps (TDD)

1. **RED** — `fundamentals-store.test.ts`: use a temp DB (`JOURNAL_DB_PATH` to tmpdir,
   mirror `watchlist-store.test.ts` setup). Assert set→get round-trip, `isStale` true/false
   across a ttl boundary, missing symbol → null.
2. **GREEN** — implement `fundamentals-store.ts` until store tests pass.
3. **RED** — refresh test: stub client (inject) → `refreshSymbol` writes to store; a throwing
   symbol leaves the batch running and is logged.
4. **GREEN** — implement `refresh.ts` (client injectable for tests).
5. Wire nightly cron in `index.ts`. **IMPROVE** — dedupe cron block style with digest cron.

## Success Criteria

- [ ] `tsc --noEmit` clean.
- [ ] Store round-trip + staleness tests pass against a temp DB.
- [ ] `refreshSymbol` persists; a failing symbol doesn't abort `refreshWatchlist`.
- [ ] Cron registered without blocking the request path.

## Risk Assessment

- **Shared journal.db growth** — fundamentals blobs are small + capped statement count; negligible.
- **Cron + manual refresh race** — upsert is idempotent; last-write-wins is fine for cache.
