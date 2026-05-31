# Phase 04: Ownership (major shareholders + officers + structure)

**Priority:** Medium | **Status:** Done — 2026-05-31 (99/99 tests, tsc clean) | **Effort:** Medium
**Depends on:** Phase 01–03 (reuses the vnstock-CLI → client → SQLite-cache → route → tab architecture)

## Overview

Second milestone of the fundamentals suite. Surfaces *who owns the company*:
major shareholders, board/management officers (with their holdings), and the
ownership structure (foreign / state / free-float %). Same pattern as Phase 1:
a Python `vnstock` CLI one-shot → typed TS client → SQLite cache (on-demand +
nightly) → REST route → a tab on `TickerDetailPanel`.

## Data reality (probed against vnstock 4.0.4, source VCI)

- **Available:** `Company.shareholders()` (holder, quantity, %, update_date),
  `Company.officers()` (name, position, own %, own quantity, update_date),
  ownership-structure %s from `Company.trading_stats()`
  (`foreigner_percentage`, `state_percentage`, `free_float_percentage`).
- **NOT available (dropped from scope):** insider deals/trading. `insider_trading`
  raises `NotImplementedError` on VCI; KBS returns an empty frame. No free data
  source → cannot build. Revisit only with a paid vnstock tier or another source.

## Files to Create

- `scripts/vnstock-ownership.py` — CLI: `argv[1]=symbol` → prints `{structure, shareholders, officers}` JSON
- `src/server/fundamentals/ownership-types.ts` — `Ownership`, `Shareholder`, `Officer`, `OwnershipStructure`
- `src/server/fundamentals/ownership-client.ts` — spawn python, parse + map, typed error
- `src/server/fundamentals/ownership-store.ts` — SQLite cache (table `ownership`, mirrors `fundamentals-store.ts`)
- `tests/ownership-client.test.ts` — mapper unit tests against a captured fixture
- `tests/ownership-store.test.ts` — cache + route reuse
- `tests/fixtures/vnstock-ownership-fpt.json` — one real script output, committed

## Files to Modify

- `src/server/fundamentals/refresh.ts` — generalize `refreshSymbol`/`refreshSymbols`
  to generics over a `{ set(symbol, data) }` cache + `(symbol) => Promise<T>` fetcher
  (backward-compatible; Phase 1 keeps working).
- `src/server/fundamentals/route.ts` — extract a generic `registerSymbolCacheRoute`
  (validate symbol, fresh-hit, on-demand fetch + dedup, stale-on-failure, 502);
  re-point the fundamentals route at it; add the ownership route via the same helper.
- `src/server/index.ts` — `OwnershipStore` instance, `GET /api/ownership/:symbol`,
  fold ownership symbols into the nightly refresh cron.
- `src/web/components/TickerDetailPanel.tsx` — add a "Sở hữu" (Ownership) tab.

## Output JSON contract (`scripts/vnstock-ownership.py`)

```json
{ "structure": { "foreignPct": 0, "statePct": 0, "freeFloatPct": 0 },
  "shareholders": [ { "name": "", "quantity": 0, "pct": 0, "asOf": "" } ],
  "officers":     [ { "name": "", "position": "", "quantity": 0, "pct": 0 } ] }
```

- Top **N=20** shareholders by %, descending. Officers as returned.
- Same stdout-redirect banner suppression + non-zero-exit-on-failure as Phase 1.

## UI design

- New "Sở hữu" tab, lazy-fetched on first open (progressive disclosure).
- **Structure**: 3 small cards — Sở hữu nước ngoài / Nhà nước / Tự do (foreign/state/free-float %).
- **Shareholders**: compact table — Cổ đông | SL cổ phần | Tỷ lệ (most → least).
- **Officers**: table — Lãnh đạo | Chức vụ | Tỷ lệ. `null` → "—". VN labels.

## Implementation Steps (TDD)

1. Write `scripts/vnstock-ownership.py`; run for FPT; commit stdout as the fixture.
2. **RED** — `ownership-client.test.ts`: feed fixture through mapper → assert mapping + nulls.
3. **GREEN** — `ownership-types.ts` + `ownership-client.ts`.
4. Generalize `refresh.ts` to generics; confirm Phase 1 tests still green.
5. Extract `registerSymbolCacheRoute`; re-point fundamentals route; add ownership route. Tests.
6. `ownership-store.ts` + store/route tests (reuse Phase 1/2 test idioms).
7. Wire `index.ts` (store, route, cron). Add "Sở hữu" tab + `TickerOwnership.tsx`.

## Success Criteria

- [ ] `tsc --noEmit` clean; full `vitest run` green (Phase 1 tests unaffected).
- [ ] `GET /api/ownership/:symbol` cache-hit < 200ms; miss → on-demand fetch.
- [ ] Ownership tab renders shareholders + officers + structure; `null` → "—".
- [ ] Insider deals explicitly out (documented); no dead code for it.
- [ ] vnstock version unchanged (4.0.4); ownership script copied into Docker image.

## Risk Assessment

- **DRY refactor of refresh.ts / route.ts touches shipped Phase 1 code** → keep changes
  additive/backward-compatible; re-run the full suite after each refactor step.
- **vnstock shareholder/officer shape drift** → fixture-based mapper tests, same as Phase 1.
- **Insider-deal expectation** → scope explicitly drops it (no data); surfaced to user.
