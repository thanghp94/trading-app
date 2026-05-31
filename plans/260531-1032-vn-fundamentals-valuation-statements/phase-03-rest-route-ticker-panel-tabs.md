# Phase 03: REST Route + TickerDetailPanel Tabs

**Priority:** High | **Status:** Todo | **Effort:** Medium
**Depends on:** Phase 02

## Overview

Expose cached fundamentals over REST and surface them as Valuation + Financials tabs
inside the existing `TickerDetailPanel` (progressive disclosure — only loads when panel open).

## Files to Modify

- `src/server/index.ts` — `GET /api/fundamentals/:symbol`
- `src/web/components/TickerDetailPanel.tsx` — add Valuation + Financials tabs

## Files to Create

- `src/web/components/TickerFundamentals.tsx` — render valuation cards + statements table
- `tests/fundamentals-route.test.ts` — route returns cache hit; cache miss → on-demand fetch

## Route design

- `GET /api/fundamentals/:symbol`:
  - cache hit (fresh) → return stored `Fundamentals`.
  - cache miss / stale → `refreshSymbol(sym)` on-demand, then return (so any opened ticker
    works even if not on the watchlist).
  - upstream failure with no cache → `502` + `{ error }`.
- Response shape = `Fundamentals` from Phase 01 types.

## UI design

- New `TickerFundamentals.tsx`, lazy-fetched when the fundamentals tab is first opened
  (don't fetch on panel mount — keep intraday the default view).
- **Valuation**: small labelled cards — VN-primary labels (Vốn hóa, P/E, P/B, ROE, EPS,
  Tỷ suất cổ tức). `null` → "—".
- **Financials**: compact table, most-recent-first, columns = revenue / gross / net /
  assets / equity / op-cashflow; rows = periods. Numbers VN-formatted (`toLocaleString('vi-VN')`).
- Match existing panel styling (reuse `Drawer`/section idioms already in TickerDetailPanel).

## Implementation Steps (TDD)

1. **RED** — `fundamentals-route.test.ts`: introduce the repo's first `fastify.inject()`
   route test (no route-test pattern exists today). Build the fastify instance with a seeded
   store + injected refresh; assert cache-hit returns stored payload, empty store triggers
   refresh then returns, upstream-failure-with-no-cache → 502.
2. **GREEN** — add route in `index.ts`.
3. Build `TickerFundamentals.tsx` (presentational; fetches `/api/fundamentals/:symbol`).
4. Add tab switch to `TickerDetailPanel.tsx` (Intraday | Valuation | Financials);
   lazy-load fundamentals on first tab open.
5. **IMPROVE** — extract a shared number-format helper if duplicated with `fmtPrice`.

## Success Criteria

- [ ] `tsc --noEmit` clean; full `vitest run` green.
- [ ] Route returns cached fundamentals < 200ms; cache miss fetches on demand.
- [ ] Opening a ticker → Valuation + Financials tabs render real data, `null`→"—".
- [ ] Fundamentals only fetched when its tab is opened (verified manually in UI).

## Risk Assessment

- **On-demand fetch latency on cache miss** — acceptable (first open only); subsequent cached.
- **Panel re-render churn** — gate fetch behind tab-open state; reset on symbol change like intraday.
