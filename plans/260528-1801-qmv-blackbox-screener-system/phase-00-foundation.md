# Phase 00 — Foundation (shared infra)

**Priority:** P0 (blocks all). **Status:** todo. **Data:** OHLCV only.

Universe-scan engine + daily snapshot store. Both serve every later phase.

## Why

Today's scanner ranks only **pinned** watchlist (`watchlist-scanner.ts`). QMV scans a **universe** (VN30/VN100) daily and persists snapshots so multi-session signals (tiền vào N phiên, anchor cumulative) work. In-memory ring buffer (AlertEngine) loses history on restart — insufficient.

## Files

**Create**
- `src/server/scanner/universe.ts` — VN30/VN100 lists + resolver `getUniverse(name): string[]`. Seed from existing `src/server/market/sector-map.ts` (`VN30_SYMBOLS`, `ALL_TRACKED_SYMBOLS` ~90).
- `src/server/blackbox/snapshot-store.ts` — SQLite `blackbox.db`, table `daily_snapshot(symbol, date, close, volume, dm_daily, ds_daily, box_raw, … PK(symbol,date))`. Append-only daily + backfill.
- `src/server/blackbox/backfill-job.ts` — pull daily OHLCV from anchor (2021-03-20) → compute DM/DS proxy → write snapshots. Idempotent (skip existing dates).
- `src/server/blackbox/daily-job.ts` — cron/once-a-day: fetch latest close, append snapshot for whole universe.

**Read for context**
- `src/server/symbol-manager.ts` (routing, `isVnEquitySymbol`)
- `src/server/market/sector-map.ts` (universe seeds, 11 sectors)
- `src/server/adapters/entrade-adapter.ts` / `dnse-adapter.ts` (daily OHLCV fetch, ~10y history)
- `src/server/journal/store.ts` (SQLite pattern to mirror)
- `src/shared/types.ts` (`Candle`)

## Steps

1. `universe.ts`: export VN30 (from sector-map), VN100 (TODO source list — open question), `getUniverse()`.
2. `snapshot-store.ts`: SQLite schema + `upsert`, `getSeries(symbol)`, `getLatest(date)`, `hasDate`.
3. `backfill-job.ts`: for each universe symbol → fetch daily bars anchor→today → `moneyFlowProxy` (Phase 01 dep, stub first) → upsert. Rate-limit adapter calls.
4. `daily-job.ts`: wire into `src/server/index.ts` startup + daily timer.

## Todo

- [ ] `universe.ts` (VN30 wired; VN100 list pending decision)
- [ ] `snapshot-store.ts` SQLite + CRUD
- [ ] `backfill-job.ts` (anchor→today, idempotent, rate-limited)
- [ ] `daily-job.ts` + wire to server
- [ ] smoke: backfill 5 symbols, verify rows + no dup dates

## Success criteria

- `blackbox.db` holds daily snapshots anchor→today for the universe.
- Re-run backfill = no dups, fills only gaps.
- `getSeries('HPG')` returns ordered daily array.

## Risks

- Adapter rate limits on bulk backfill (90+ symbols × ~1200 days) → batch + delay; cache raw bars.
- Yahoo fallback 429s → prefer DNSE/Entrade for backfill.

## Next

Phase 01 plugs real `moneyFlowProxy` into backfill; remove stub.
