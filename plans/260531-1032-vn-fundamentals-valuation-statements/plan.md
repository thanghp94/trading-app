# VN Fundamentals Suite — Phase 1 (Valuation + Statements)

**Status:** Planning
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
- **OUT (future phases):** ownership/insider deals, dividend/corporate-action calendar,
  fundamental screener, council `analystFundamental` wiring.

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
| 01 | vnstock CLI Script + TS Client + Types | Todo | — |
| 02 | SQLite Cache + Nightly Refresh | Todo | 01 |
| 03 | REST Route + TickerDetailPanel Tabs | Todo | 02 |

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
