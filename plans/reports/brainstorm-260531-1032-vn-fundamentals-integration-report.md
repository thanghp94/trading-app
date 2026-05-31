# Brainstorm — VN Fundamentals Suite Integration

Date: 2026-05-31 | Status: APPROVED | Next: `/ck:plan`

## Problem statement

Trading-app today is price/technical-only (charts, screener, signal-study, alerts, AI council, VN microstructure). User wants to add a **full fundamentals suite** (valuation + financial statements + ownership/insider + dividend/corporate-action calendar) to move toward a fuller VN terminal.

**Decision context (explicit, user-confirmed, overrides the sprawl flag):**
- Scope intent = deliberate scope expansion (Full fundamentals suite, not minimal slice).
- Sequencing = finish telegram-gate wiring (uncommitted in `index.ts`) BEFORE starting this.
- Advisor flagged sprawl vs `goals.md` "finish trading-app" target; user overrode with conviction. Respected.

## Requirements (the 5 gates)

1. **Expected output**: `src/server/fundamentals/` module + `GET /api/fundamentals/:symbol` + fundamentals tabs on `TickerDetailPanel` (Valuation / Financials, phase 1).
2. **Acceptance**: open a VN ticker → see P/E, P/B, ROE, EPS, market cap, dividend yield + income/balance/cashflow summary ratios, served from SQLite cache, refreshed nightly.
3. **Scope boundary (phase 1)**: Valuation + Financial statements only. OUT: ownership/insider, dividend calendar (later phases). OUT: fundamental screener.
4. **Constraints**: TS single runtime (no Python sidecar), match existing adapter pattern, SQLite cache (better-sqlite3), progressive disclosure (hidden until ticker opened), bilingual labels.
5. **Touchpoints**: new `src/server/fundamentals/*`, `src/server/index.ts` (route + refresh cron), `src/web/components/TickerDetailPanel.tsx` (tabs), optional later: `ai/council/agents.ts` (unstub analystFundamental).

## Approaches evaluated

| # | Approach | Pros | Cons | Verdict |
|---|---|---|---|---|
| A | **TS port of TCBS public endpoints** | single runtime; matches existing TS broker adapters (dnse/entrade/ssi); port-over-rewrite; no deploy change | own endpoint-drift risk | **CHOSEN** |
| B | Python vnstock sidecar (FastAPI) | richest data; vnstock absorbs drift | new runtime + Docker service + deploy complexity; against KISS for single-user | rejected |
| C | vnstock CLI via child_process | no standing service; full vnstock | Python cold-start per call; dep fragility in VPS/Docker | rejected |

`vnstock` is a thin wrapper over public TCBS JSON (`apipubaws.tcbs.com.vn`: overview, ratios, financial statements, dividends, insider deals). Porting the needed endpoints to TS keeps one runtime and reuses the codebase's HTTP-adapter muscle.

## Recommended solution (Approach A)

```
src/server/fundamentals/
  tcbs-fundamental-client.ts   # typed HTTP → TCBS endpoints
  fundamentals-store.ts        # SQLite cache
  types.ts                     # Valuation, Statement (+ later: InsiderDeal, DividendEvent)
  refresh.ts                   # nightly cron refresh (fundamentals move quarterly → cache hard)
```

- REST: `GET /api/fundamentals/:symbol` → `{ valuation, statements }` (phase 1).
- Cache: SQLite + nightly `node-cron` refresh (reuse cron already in `index.ts`). Near-zero live load.
- UI: tabs on existing `TickerDetailPanel` — *Valuation / Financials* — hidden until ticker opens (progressive disclosure).
- Reuse bonus (later): feed council `analystFundamental` (currently stubbed) with real ratios.

## Phasing

1. **Valuation snapshot** — P/E, P/B, ROE, EPS, mkt cap, div yield. (~60% of value)
2. **Financial statements** — income/balance/cashflow summary ratios. ← phase-1 plan covers 1+2
3. Ownership/insider (later)
4. Dividend/corporate-action calendar (later; can push to daily digest)

## Risks + mitigation

- **TCBS endpoint drift** → isolate in single client file; contract test pings live + validates shape.
- **Scope creep** → phasing is the guardrail; no fundamental-screener until suite lands.
- **Prerequisite** → telegram-gate wiring must land + commit first.

## Success metrics

- Open any VN30 ticker → valuation + statements render < 200ms (from cache).
- Nightly refresh updates cache without blocking request path.
- Zero new deploy units (still one Fastify process).

## Next steps

1. Finish + commit telegram-gate wiring (`index.ts`) — prerequisite.
2. `/ck:plan` this report → phase plan for Valuation + Statements (Approach A).

## Unresolved questions

- TCBS rate limits / need for a user-agent or token? (verify at client-build time)
- VN30-only universe for phase 1, or all active watchlist symbols? (assume watchlist universe)
- Bilingual ratio labels: VN primary or EN primary on the panel? (assume VN primary per user convention)
