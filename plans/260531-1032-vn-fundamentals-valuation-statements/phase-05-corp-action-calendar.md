# Phase 05: Dividend / Corporate-Action Calendar

**Priority:** Medium | **Status:** Done — 2026-05-31 (113/113 tests, tsc clean) | **Effort:** Medium
**Depends on:** Phase 01–04 (reuses vnstock-CLI → client → SQLite-cache → generic route → tab)

## Overview

Third milestone. Surfaces *what's happening to the stock*: dividends, share issues,
AGMs, additional listings, and director-deal announcements — a corporate-action
calendar. Same architecture as Phase 1/2; this phase ALSO does a rule-of-three DRY
pass on the SQLite store (3rd near-identical cache).

## Data reality (probed, vnstock 4.0.4, source VCI)

`Company.events()` → 50 rows × 22 cols. Confirmed columns/values for FPT:
- `event_code` distinct: `DIV` (cash dividend), `ISS` (share issue), `AGME` (AGM),
  `AIS` (additional listing), `DDIND`/`DDRP`/`DDINS` (director/insider deal announcements).
- `category` (e.g. `DIVIDEND`), `event_name_vi`/`_en`, `event_title_vi`/`_en` (rich, incl. amount).
- Dates: `public_date`, `record_date`, `exright_date`, `payout_date` (mix of `YYYY-MM-DD`
  and ISO `…T00:00:00`). `value_per_share` (float VND), `exercise_ratio` (float).

Note: director-deal *announcement events* appear here (`DDIND`…). The dedicated
insider-deal detail table is still unavailable (Phase 4 finding) — unchanged. The
calendar shows the event announcements as-is; no separate insider feature implied.

## Files to Create

- `scripts/vnstock-corp-actions.py` — CLI: `argv[1]=symbol` → prints `{events:[…]}` JSON
- `src/server/fundamentals/symbol-json-cache.ts` — generic `SymbolJsonCache<T>` base (table-name param)
- `src/server/fundamentals/corp-action-types.ts` — `CorpEvent`, `CorpActionCalendar`
- `src/server/fundamentals/corp-action-client.ts` — spawn python, map, typed error
- `src/server/fundamentals/corp-action-store.ts` — thin `SymbolJsonCache<CorpActionCalendar>` subclass (table `corp_events`)
- `src/web/components/TickerCorpActions.tsx` — calendar table (type, title, dates, value)
- `tests/corp-action-client.test.ts`, `tests/corp-action-store.test.ts`
- `tests/fixtures/vnstock-corp-actions-fpt.json`

## Files to Modify (DRY rule-of-three)

- `src/server/fundamentals/fundamentals-store.ts` — re-express as `extends SymbolJsonCache<Fundamentals>` (public API + tests unchanged)
- `src/server/fundamentals/ownership-store.ts` — re-express as `extends SymbolJsonCache<Ownership>`
- `src/server/index.ts` — `CorpActionStore`, `GET /api/corp-actions/:symbol`, fold into nightly cron
- `src/web/components/TickerDetailPanel.tsx` — add "Sự kiện" tab (4-way)
- `Dockerfile` — copy the new script

## Output JSON contract (`scripts/vnstock-corp-actions.py`)

```json
{ "events": [ { "code": "DIV", "category": "DIVIDEND",
    "nameVi": "", "nameEn": "", "titleVi": "", "titleEn": "",
    "date": "2026-05-28",          // primary date for sort: first non-null of exright/record/public/payout
    "publicDate": "", "recordDate": "", "exrightDate": "", "payoutDate": "",
    "valuePerShare": 1000, "exerciseRatio": 0.1 } ] }
```

- All dates normalized to `YYYY-MM-DD` (strip time), null when absent.
- Sorted by `date` descending (most-recent/upcoming first). Cap at 50 (what events() returns).
- Same stdout-redirect banner suppression + non-zero-exit-on-failure as Phase 1/2.

## UI design

- New "Sự kiện" tab, lazy-fetched on first open.
- Table: Ngày | Loại (VN event name) | Nội dung (title) | Giá trị (value_per_share VND, or ratio).
  `null` → "—". VN labels. Most-recent-first. Optional small colour cue per category.

## Implementation Steps (TDD)

1. Write `scripts/vnstock-corp-actions.py`; run for FPT; commit stdout as fixture.
2. **DRY**: extract `symbol-json-cache.ts`; refactor fundamentals-store + ownership-store to
   subclasses; run full suite → Phase 1/2 green (no behavior change).
3. **RED** — `corp-action-client.test.ts`: map fixture → assert events, date normalization, nulls, errors.
4. **GREEN** — `corp-action-types.ts` + `corp-action-client.ts`.
5. `corp-action-store.ts` (subclass) + store/route tests (reuse generic route).
6. Wire `index.ts` (store, route, cron). Add "Sự kiện" tab + `TickerCorpActions.tsx`.
7. Verify: tsc + full vitest + code review.

## Success Criteria

- [ ] `tsc --noEmit` clean; full `vitest run` green (Phases 1–2 unaffected by the store refactor).
- [ ] `GET /api/corp-actions/:symbol` cache-hit < 200ms; miss → on-demand fetch.
- [ ] Calendar tab renders events most-recent-first; dates `YYYY-MM-DD`; `null` → "—".
- [ ] vnstock version unchanged (4.0.4); script copied into Docker image.

## Risk Assessment

- **Store refactor touches 2 shipped stores** → subclass wrappers keep the public API + all
  existing tests; re-run full suite immediately after step 2.
- **Mixed date formats** → normalize defensively (slice first 10 chars of any date-like string).
- **event shape drift** → fixture-based mapper tests, same as Phase 1/2.
- **Table name in DDL** → `SymbolJsonCache` asserts the table name matches `^[a-z_]+$` (internal
  constants only; defensive guard against accidental injection).
