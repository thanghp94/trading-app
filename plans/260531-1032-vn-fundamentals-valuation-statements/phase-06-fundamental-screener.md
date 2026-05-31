# Phase 06: Fundamental Screener (augment existing screener)

**Priority:** Medium | **Status:** Done — 2026-05-31 (122/122 tests, tsc clean) | **Effort:** Medium
**Depends on:** Phase 01 (fundamentals cache)

## Overview

Add fundamentals (P/E, P/B, ROE, market cap, dividend yield + a composite value
score) to the existing QMV screener. Decisions (locked with user):
- **Surface:** augment the existing `/api/screener` + `ScreenerPanel` (one unified
  TA+fundamentals screener), not a separate endpoint.
- **Universe/perf:** pre-warm fundamentals for the **tracked (~90)** universe nightly so
  the screener reads cache instantly (90 live python spawns on a request = minutes; unacceptable).
- **Criteria:** standard value set — P/E max, P/B max, ROE min, market-cap min; rank by a
  composite `valueScore`.

Fundamentals are **attached from cache only** during a scan (never fetched inline — keeps
the screener fast). Filtering + value-ranking happen client-side via chips/sort, matching
the panel's existing client-side chip model. A symbol with no cached fundamentals simply
shows "—" and is excluded only when a fundamental chip is active.

## Files to Modify

- `src/shared/screener-types.ts` — add `ScreenerFundamentals` + optional `fundamentals?` on `ScreenerRow`.
- `src/server/index.ts` — `/api/screener` enriches rows from `fundamentalsStore`; nightly cron
  pre-warms fundamentals for `getUniverse("tracked")` ∪ watchlist (ownership/corp-actions stay watchlist).
- `src/web/components/ScreenerPanel.tsx` — fundamental columns (P/E, P/B, ROE, Vốn hóa, Điểm GT),
  fundamental filter chips (P/E≤15, P/B≤2, ROE≥15%, Cổ tức>0), and a "sort by value" toggle.

## Files to Create

- `src/server/screener/fundamental-filter.ts` — `computeValueScore(f)` + `enrichRows(rows, getFundamentals)`. Pure, testable.
- `tests/screener-fundamental-filter.test.ts` — valueScore math + enrichment (cache hit / miss).

## Composite valueScore (0–100, heuristic — display/rank aid, not predictive)

Weighted average of available components (skip nulls; all-null → null):
- ROE (0.40): `roe>=0.25 → 100`, `roe<=0 → 0`, linear.
- P/E (0.30): `pe<=8 → 100`, `pe>=30 → 0`, linear; null/≤0 skipped.
- P/B (0.20): `pb<=1 → 100`, `pb>=4 → 0`, linear; null/≤0 skipped.
- Dividend yield (0.10): `dy>=0.06 → 100`, `dy<=0 → 0`, linear.

Documented as a value-tilt heuristic; never claimed predictive (same honesty as the
blackbox proxy caveat).

## Server design

- `enrichRows(rows, getFundamentals)`: for each row, `f = getFundamentals(symbol)`; if present,
  attach `{ pe, pb, roe, eps, marketCap, dividendYield, valueScore }`. Cache-only, no spawn.
- `/api/screener`: `runScreener(...)` (unchanged TA) → `enrichRows(rows, s => fundamentalsStore.get(s))`
  → return. Default sort unchanged (★ then score); valueScore is a column + optional client sort.
- Cron: fundamentals refresh symbol set = dedupe(`getUniverse("tracked")` + watchlist). Keeps the
  screener cache warm across the scannable universe.

## UI design

- New columns after RSI/before Blackbox: **P/E, P/B, ROE, Vốn hóa (tỷ), Điểm GT** (value score).
  `null` → "—". ROE/dy as %, mcap in tỷ, ratios 2dp.
- New chips: `P/E≤15`, `P/B≤2`, `ROE≥15%`, `Cổ tức>0` — client predicates over `r.fundamentals`
  (a row without fundamentals fails an active fundamental chip).
- "Sắp xếp: Giá trị" toggle → sort by `fundamentals.valueScore` desc (default stays ★/score).
- Footer note: fundamentals from nightly vnstock cache; value score is a heuristic tilt.

## Implementation Steps (TDD)

1. Types: `ScreenerFundamentals` + optional field on `ScreenerRow`.
2. **RED** — `screener-fundamental-filter.test.ts`: valueScore boundaries (low-P/E high-ROE → high;
   missing components; all-null → null) + `enrichRows` (attaches on cache hit, leaves undefined on miss).
3. **GREEN** — `fundamental-filter.ts`.
4. Wire `/api/screener` enrichment + cron universe change in `index.ts`.
5. ScreenerPanel: columns + chips + sort toggle.
6. Verify: tsc + full vitest + code review.

## Success Criteria

- [ ] `tsc --noEmit` clean; full `vitest run` green (existing screener tests unaffected).
- [ ] `/api/screener` rows carry `fundamentals` when cached; scan latency unchanged (no inline fetch).
- [ ] Panel shows fundamental columns + chips + value sort; `null` → "—".
- [ ] Nightly cron pre-warms tracked-universe fundamentals (verified by log/inspection).

## Risk Assessment

- **Cron load**: ~90 python spawns nightly (sequential, 300ms spacing ≈ 4–5 min off-hours). Acceptable.
- **Stale fundamentals in screener**: cache TTL 1 day + nightly refresh; screener shows last cached.
  Acceptable for quarterly-changing data.
- **valueScore misread as signal**: documented heuristic + footer caveat; not a default sort.
- **Universe drift**: watchlist symbols outside `tracked` still pre-warmed via the union.
