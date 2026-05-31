# VN Fundamentals Suite — Phase 1 (Valuation + Statements)

**Status:** Implemented — 2026-05-31 (86/86 tests, tsc clean; pending commit)
**Created:** 2026-05-31
**Slug:** 260531-1032-vn-fundamentals-valuation-statements
**Mode:** TDD
**Brainstorm:** `plans/reports/brainstorm-260531-1032-vn-fundamentals-integration-report.md`

## Goal

Add a fundamentals data layer to the (currently price/technical-only) trading-app.
Phase 1 ships **Valuation + Financial Statements** for VN equities, served from a
SQLite cache, surfaced as tabs on the existing `TickerDetailPanel`.

Approach **C** (locked after validation): Python **vnstock** invoked as a CLI one-shot
via Node `child_process` — only on cache-miss + nightly refresh; results cached hard in
SQLite. Reverses the brainstorm's Approach A (TS port of TCBS public endpoints) because
those endpoints returned `404 Service not found` during validation — vnstock resolves the
correct upstream sources + absorbs endpoint drift. No standing service (rejected sidecar).

## Scope (locked)

- **IN:** Valuation snapshot (P/E, P/B, ROE, EPS, market cap, dividend yield) + financial-
  statement summary ratios (income/balance/cashflow). SQLite cache + nightly refresh.
  REST `GET /api/fundamentals/:symbol`. Valuation + Financials tabs on TickerDetailPanel.
- **PHASE 2 (Phase 04, in progress):** ownership — major shareholders + officers +
  ownership structure (foreign/state/free-float %). Insider deals dropped (no free data
  source in vnstock 4.0.4). See `phase-04-ownership.md`.
- **PHASE 3 (Phase 05, in progress):** dividend / corporate-action calendar from
  `Company.events()` (DIV/ISS/AGME/AIS/director-deal announcements). See `phase-05-…md`.
- **PHASE 4 (Phase 06, in progress):** fundamental screener — augment existing `/api/screener` +
  `ScreenerPanel` with P/E/P/B/ROE/mcap columns + filters + composite value score; pre-warm
  tracked-universe fundamentals nightly. See `phase-06-fundamental-screener.md`.
- **OUT (future phases):** council `analystFundamental` wiring, insider-deal detail table
  (needs paid/alt source).

## Prerequisite

Telegram-gate wiring in `src/server/index.ts` (from the prior alert-spam fix) lands +
commits before this work starts. Tracked separately; not part of these phases.

## Decisions resolved

- **Data source:** Python `vnstock` (already installed + working locally) via CLI one-shot.
- **Universe:** watchlist symbols (not VN30-only). On-demand fetch for any requested symbol;
  refresh cron covers watchlist set.
- **Statements:** quarterly, last **8** quarters, most-recent-first.
- **Route test:** add the repo's first `fastify.inject()` route test (reusable pattern).
- **Label language:** VN primary (e.g. "Vốn hóa", "P/E", "ROE"), EN where standard.
- **Price convention:** VN prices are in VND; market-cap formatting follows existing
  `fmtPrice` (÷1000) idioms where shown as price.
- **Deploy:** Dockerfile/VPS image must add `python3` + pinned `vnstock` (documented in Phase 01).

## Phases

| # | Phase | Status | Depends |
|---|-------|--------|---------|
| 01 | vnstock CLI Script + TS Client + Types | Done | — |
| 02 | SQLite Cache + Nightly Refresh | Done | 01 |
| 03 | REST Route + TickerDetailPanel Tabs | Done | 02 |
| 04 | Ownership (shareholders + officers + structure) | Done | 03 |
| 05 | Dividend / corp-action calendar | Done | 04 |
| 06 | Fundamental screener (augment existing) | Done | 01 |

## Key risks

- **vnstock API/version drift** — pin version; one Python script is the only coupling point;
  unit tests run against a captured JSON fixture, not live vnstock.
- **Python subprocess failure / missing dep** — TS client treats non-zero exit / bad JSON as a
  typed error; cache serves stale on failure. Docker image must ship python3 + vnstock.
- **Cold-start latency (~1–2s)** — acceptable: only on cache-miss + nightly; cached thereafter.
- **Scope creep** — phasing is the guardrail; resist adding screener/ownership until Phase 1 lands.

## Open questions (resolve at build time)

- Exact vnstock call surface for valuation ratios + quarterly statements (confirm against the
  installed version; capture one real output into a fixture before writing the TS mapper).
- vnstock version to pin (record from local working install).

## Validation Log

### Session 1 — 2026-05-31

**Verification (Standard tier, 3 phases):**
- VERIFIED: `node-cron` + 15:15 digest cron in `index.ts:49,62` (cron-pattern reuse holds).
- VERIFIED: `watchlist-store.ts` SQLite + `JOURNAL_DB_PATH` convention; test setup uses
  `mkdtempSync` + `JOURNAL_DB_PATH` (Phase 02 test approach holds).
- FAILED: TCBS endpoints (`apipubaws.tcbs.com.vn/tcanalysis/...`, incl. known price path) all
  returned `404 Service not found` from sandbox. Root cause ambiguous (API drift vs sandbox
  egress filter). → Triggered approach reversal.
- FAILED: no `fastify.inject()` / route test exists in `tests/`. → Phase 03 now introduces one.

**Decisions confirmed:**
1. Data source → **Python vnstock via CLI one-shot** (reverses brainstorm Approach A; justified by
   new data: TCBS endpoints failing + vnstock absorbs source/drift). vnstock confirmed installed locally.
2. Route testing → add first `fastify.inject()` test (reusable pattern).
3. Statements → quarterly, last 8, most-recent-first.

**Propagated to phases:** 01 rewritten (vnstock CLI + TS client), 02 source dep noted, 03 inject test.
Phase-01 file renamed `phase-01-tcbs-fundamental-client.md` → `phase-01-vnstock-cli-client.md`.

### Whole-Plan Consistency Sweep

- Searched all files for stale "TCBS port"/"tcbs-fundamental-client"/"contract test pings live
  TCBS" terms → updated to vnstock CLI equivalents.
- `plan.md` Approach + Decisions + Risks + Open-questions reconciled with phases 01–03.
- Statement granularity (quarterly/8) consistent across plan + phase 01 + phase 03.
- Output JSON contract appears in phase 01 (script + types) only — no duplicate divergent copy.
- **Result: 0 unresolved contradictions.** Plan eligible for implementation.

### Session 2 — Build (2026-05-31)

Implemented all 3 phases. 86/86 tests pass, `tsc --noEmit` clean (server + web).
Deviations from plan assumptions (none reverse a user decision; all surfaced):

- **vnstock was NOT pre-installed** (plan validation log claimed "confirmed installed
  locally" — incorrect). Installed `vnstock==4.0.4` into a project venv `pyvenv/`
  (gitignored; Homebrew python is PEP 668 externally-managed). `PYTHON_BIN` env points
  the TS client at it; Dockerfile installs system python3 + `requirements.txt`.
- **Source = VCI** (vnstock 4.0.4 `Finance` supports only VCI/KBS; no TCBS). Valuation
  snapshot from `Company.ratio_summary()` latest row (pe/pb/roe/market_cap/dividend_yield);
  statements from `income_statement`/`balance_sheet`/`cash_flow`.
- **Statements depth = 4 quarters, not 8.** VCI/KBS free tier caps statement history at
  4 quarters; script requests 8 (`[:8]`) and stores what's returned. Contract unchanged
  ("up to 8, most-recent-first"); UI table renders the available quarters.
- **EPS basis:** `eps_basic_vnd` from the latest income-statement quarter (ratio_summary
  has no EPS field). P/E is ratio_summary's TTM-style figure → EPS and P/E are on
  different bases (known, acceptable for a snapshot; flagged by review).
- **Added `route.ts` registrar** (not in plan's file list) so the `fastify.inject()` test
  can seed a store + inject the fetcher — matches the repo's `registerChatRoute` idiom.
- **UI: single "Cơ bản" tab** holds both valuation cards + statements table (one payload,
  one fetch) rather than two separate tabs. Both surfaced; lazy-fetched on tab open.
- **Review hardening applied:** symbol regex validation (400 on bad input) + in-flight
  fetch coalescing on the route; explicit reverse-sort of statement periods in the script.

Code review verdict: **SHIP**. Live smoke test spawns the real script (skips when python
absent in CI).

### Session 3 — Build Phase 04 Ownership (2026-05-31)

Implemented ownership milestone. 99/99 tests pass, tsc clean (server + web). Review: **SHIP**.

- **Insider deals DROPPED** — vnstock 4.0.4 `insider_trading`/`ownership` raise
  NotImplementedError on VCI; KBS `insider_trading` returns empty. No free data source.
  Scope = shareholders + officers + structure only (foreign/state/free-float %).
- New: `vnstock-ownership.py`, `python-runner.ts` (extracted shared spawn), `ownership-types.ts`,
  `ownership-client.ts` (`OwnershipError`), `ownership-store.ts` (table `ownership`),
  `TickerOwnership.tsx`, + "Sở hữu" tab. Route `GET /api/ownership/:symbol`.
- **DRY refactor of shipped Phase 1 code (backward-compatible, regression-tested):**
  `refresh.ts` → generics `<T>` over `SymbolCache<T>`/`SymbolFetcher<T>` (fetcher now required);
  `route.ts` → generic `registerSymbolCacheRoute<T>` (path+label+fetcher); `vnstock-client.ts`
  default runner delegates to `python-runner`. Fixed an unhandled-rejection bug in the
  in-flight dedup (cleanup moved from `pending.finally()` to handler `try/finally`).
- Nightly cron now refreshes both fundamentals + ownership for the watchlist.
- Data source unchanged (VCI, vnstock 4.0.4); Docker copies the ownership script too.

### Session 4 — Build Phase 05 Corp-Action Calendar (2026-05-31)

Implemented dividend/corp-action calendar. 113/113 tests pass, tsc clean (server + web). Review: **SHIP**.

- Source: `Company.events()` (VCI) — 50 events: DIV/ISS/AGME/AIS + director-deal announcements
  (DDIND/DDRP/DDINS). Dates normalized to `YYYY-MM-DD`, sorted desc; `value_per_share` + `exercise_ratio`.
- New: `vnstock-corp-actions.py`, `corp-action-types.ts`, `corp-action-client.ts` (`CorpActionError`),
  `corp-action-store.ts`, `TickerCorpActions.tsx`, + "Sự kiện" tab. Route `GET /api/corp-actions/:symbol`.
- **DRY rule-of-three:** extracted generic `SymbolJsonCache<T>` (table-name param, regex-guarded);
  `FundamentalsStore`/`OwnershipStore` now thin subclasses. Reviewer diffed SQL byte-for-byte → zero
  behavior drift; Phase 1/2 store tests green unchanged.
- Nightly cron + Docker now cover all three domains (fundamentals, ownership, corp-actions).
- Note: director-deal *announcement events* surface in the calendar; the dedicated insider-deal
  detail table remains unavailable (unchanged from Phase 4).

### Session 5 — Build Phase 06 Fundamental Screener (2026-05-31)

Augmented existing screener with fundamentals. 122/122 tests pass, tsc clean (server + web). Review: **SHIP**.

- Decisions (user): augment existing `/api/screener` + `ScreenerPanel` (not standalone); pre-warm
  **tracked (~90)** universe fundamentals nightly; standard value set (P/E/P/B/ROE/mcap) + composite valueScore.
- New: `screener/fundamental-filter.ts` — pure `computeValueScore` (0-100 heuristic: ROE .4, P/E .3,
  P/B .2, divYield .1), `toScreenerFundamentals`, `enrichRows` (cache-only attach, NO inline spawn → scan latency unchanged).
- `ScreenerRow` gains optional `fundamentals?` (backward-compatible). `/api/screener` enriches from
  `fundamentalsStore` cache. ScreenerPanel: 5 columns (P/E/P/B/ROE/Vốn hóa/Điểm GT) + 4 chips
  (P/E≤15, P/B≤2, ROE≥15%, Có cổ tức) + "Sắp: ★/Giá trị" sort toggle.
- **Cron change:** fundamentals now pre-warm `tracked ∪ watchlist` (~90); ownership/corp-actions stay
  watchlist. Verified empty-watchlist still pre-warms fundamentals, skips the per-ticker domains.
- valueScore documented as a value-tilt heuristic (not predictive), footer caveat in UI.
