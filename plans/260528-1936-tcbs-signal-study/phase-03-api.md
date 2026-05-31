# Phase 03 — API Route

## Overview
- Priority: P1. Depends on Phase 02.
- Single endpoint, server-fetches DNSE daily candles, runs study, returns StudyResult.

## File to modify
- `src/server/index.ts` — add `POST /api/signal-study`.

## Route spec
```
POST /api/signal-study
body: { symbol: string; fromDate?: "YYYY-MM-DD"; toDate?: "YYYY-MM-DD" }
resp: StudyResult | { error: string }
```

## Implementation
- Copy DNSE fetch pattern from `/api/backtest/vn` (index.ts:475):
  - guard `DNSE_API_KEY` / `DNSE_API_SECRET`.
  - `import { DnseAdapter }`, `fetchHistorical({ symbol, timeframe: '1d', limit: 50000, sinceSec })`.
  - default window: 5 years back (TCBS uses 5y), `fromSec`/`toSec` from body.
  - filter to window; require >= 250 bars (need history for T+180 + warmup); else 400.
  - `runSignalStudy(symbol, filtered)`.
  - `finally adapter.close()`.
- Timeframe fixed `1d` for MVP (TCBS signal study is daily-only).

## Todo
- [ ] add route
- [ ] 400 on missing creds / too few bars
- [ ] tsc compile clean + manual curl

## Success criteria
- `curl -XPOST /api/signal-study -d '{"symbol":"ORS"}'` returns 10 rows + details.
- Numbers in the right ballpark vs TCBS ORS screenshot (directional sanity, not exact —
  defs differ).

## Risks
- 5y daily ≈ 1250 bars — cheap, no perf concern.
- DNSE symbol coverage: some tickers missing → surface adapter error cleanly.
