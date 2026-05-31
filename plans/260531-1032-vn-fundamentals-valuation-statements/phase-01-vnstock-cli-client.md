# Phase 01: vnstock CLI Script + TS Client + Types

**Priority:** High | **Status:** Todo | **Effort:** Medium
<!-- Updated: Validation Session 1 — pivoted from TS TCBS port to Python vnstock CLI one-shot -->

## Overview

Python `vnstock` script emits valuation + quarterly statements as JSON on stdout; a typed TS
client spawns it via `child_process` and maps the JSON to domain types. Pure data layer — no
cache, no routes yet.

## Files to Create

- `scripts/vnstock-fundamentals.py` — CLI: `argv[1]=symbol` → prints `{valuation, statements}` JSON
- `src/server/fundamentals/types.ts` — `Valuation`, `FinancialStatement`, `Fundamentals`
- `src/server/fundamentals/vnstock-client.ts` — spawn python, parse + map JSON, typed errors
- `tests/fundamentals-client.test.ts` — mapper unit tests against a captured fixture
- `tests/fixtures/vnstock-fundamentals-fpt.json` — one real script output, committed

## Python script (`scripts/vnstock-fundamentals.py`)

- Uses the locally-installed `vnstock` (confirmed working) to fetch: valuation ratios
  (P/E, P/B, ROE, EPS, market cap, dividend yield) + quarterly income/balance/cashflow.
- Output contract (stdout, single JSON object):
  ```json
  { "valuation": { "pe": 0, "pb": 0, "roe": 0, "eps": 0, "marketCap": 0, "dividendYield": 0 },
    "statements": [ { "period": "2025-Q1", "revenue": 0, "grossProfit": 0, "netProfit": 0,
                      "totalAssets": 0, "totalEquity": 0, "operatingCashflow": 0 } ] }
  ```
- Quarterly, **last 8** quarters, most-recent-first. Missing values → JSON `null`.
- Non-zero exit + stderr message on any vnstock failure (so TS client can detect it).
- First build step: run it for FPT, pin the vnstock version (`pip show vnstock`), commit the
  output as the test fixture.

## Types (shape)

```ts
export interface Valuation {
  symbol: string;
  pe: number | null; pb: number | null; roe: number | null;
  eps: number | null; marketCap: number | null; dividendYield: number | null;
  asOf: number;
}
export interface FinancialStatement {
  period: string;            // "2025-Q1"
  revenue: number | null; grossProfit: number | null; netProfit: number | null;
  totalAssets: number | null; totalEquity: number | null; operatingCashflow: number | null;
}
export interface Fundamentals { valuation: Valuation; statements: FinancialStatement[]; }
```

## TS client (`vnstock-client.ts`)

- `fetchFundamentals(symbol): Promise<Fundamentals>` — spawn `python3 scripts/vnstock-fundamentals.py <sym>`
  (python bin + script path from env/const), collect stdout, `JSON.parse`, map → `Fundamentals`.
- Non-zero exit, empty stdout, or JSON parse failure → throw typed `VnstockError`.
- Mapper tolerates missing fields → `null`. No caching here (Phase 02 owns it).
- Configurable python binary via env (`PYTHON_BIN`, default `python3`) for Docker/venv.

## Implementation Steps (TDD)

1. Write `scripts/vnstock-fundamentals.py`; run for FPT; pin vnstock version; commit stdout as
   `tests/fixtures/vnstock-fundamentals-fpt.json`.
2. **RED** — `fundamentals-client.test.ts`: feed the fixture JSON through the mapper (inject the
   spawn/exec so the test parses the fixture, not a live call) → assert `Valuation`/`statements`
   mapping incl. missing-field → `null`. Fails (no client yet).
3. **GREEN** — implement `types.ts` + `vnstock-client.ts` until unit tests pass.
4. Add a **live smoke test** (`it.skipIf` when no python/vnstock) that actually spawns the script
   for one symbol and asserts a non-empty `Fundamentals`.
5. **IMPROVE** — extract spawn-and-collect helper if reused later.

## Success Criteria

- [ ] `tsc --noEmit` clean.
- [ ] Mapper unit tests pass against the committed fixture (incl. nulls).
- [ ] Live smoke test returns real `Fundamentals` for a symbol (or skips when python absent).
- [ ] vnstock version pinned + documented; Docker install note added to plan/README.

## Risk Assessment

- **vnstock call surface differs from assumption** → mitigated: capture real output first, map to it.
- **Subprocess/dep missing in Docker** → typed error + documented image change; cache serves stale.
