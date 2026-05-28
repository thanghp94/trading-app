# QMV Blackbox + Screener System — Build Plan

**Goal:** Replicate the QMV investment-information system (5 layers) inside trading-app, VN equities.
**Source of truth:** QMV V6 user manual (42p). Canonical math → [blackbox-math.md](./blackbox-math.md).
**Data strategy:** OHLCV proxy first (no paid data). Foreign-flow / fundamentals gated until proxy validated, then buy.

## Thesis (1 paragraph)

QMV models each stock as a closed box: buyers add money (cầu), sellers add shares (cung). Money in → price up; shares in → price down. Finite resources → saturation (bão hòa) / maintain (duy trì). Demand weighted > supply. The signal is the **turn (uốn)** at extremes of a normalized money oscillator, confirmed by money breadth. Everything QMV displays = two daily series per stock (money DM, shares DS) + standard math (cumulative, stochastic-normalize, moving-avg, consecutive-day counts, breadth).

## The data moat (read before planning further)

Real QMV DM/DS = per-stock **active money flow**, tick-level, split by order size (Cáo/Sói/Thỏ). Our adapters give **OHLCV only** (daily ~10y, intraday ~60d). So:
- Phase 1 uses an **OHLCV signed-flow proxy** — buildable today, ~60% of signal, NOT QMV-exact.
- Foreign flow + fundamentals + true tick = **paid data**, deferred. Layers L4/L5 and some L1 columns are **gated/stubbed** until a source is bought.

## PIVOT — 2026-05-28 (after Phase 01 validation gate FAILED)

Blackbox engine was built + validated. **OHLCV proxy carries no predictive edge** (gate detail in [blackbox-math.md](./blackbox-math.md#gate-result--2026-05-28-failed-as-predictive)). User decision: **blackbox = display-only/experimental; screener ★ ranking = proven TA (patterns/zones/RSI/volume-spike).** Revisit blackbox-as-signal only after spiking real paid flow data + re-passing the gate.

Net effect on plan:
- Phase 01 engine = **done, but display-only** (not a ranking input). `src/shared/blackbox/*` + `scripts/validate-blackbox.ts` exist.
- Phase 02 screener = **now TA-primary** (the ship-now path).
- Phase 00 snapshot store = still needed (universe scan + blackbox display history), lower urgency.
- Paid-data spike (L4/L5 + real blackbox) = parked until user chooses to invest.

## Phases

| # | Phase | Layer | Data | Status | Blocks |
|---|---|---|---|---|---|
| 00 | [Foundation](./phase-00-foundation.md) | shared | OHLCV | universe done; store todo | — |
| 01 | [Blackbox engine](./phase-01-blackbox-engine.md) | L2 | OHLCV proxy | **done — display-only (gate failed as predictive)** | — |
| 02 | [Screener (trader)](./phase-02-screener-trader.md) | L3 | **TA primary** + blackbox display | in progress | — |
| 03 | [Market dashboard](./phase-03-market-dashboard.md) | L1 | proxy (foreign STUB) | todo | — |
| 04 | [Monitor (investor)](./phase-04-monitor-investor.md) | L3' | gated fundamentals | todo | needs paid data |
| 05 | [Stock analysis](./phase-05-stock-analysis.md) | L4 | gated fundamentals | todo | needs paid data |
| 06 | [Portfolios](./phase-06-portfolios.md) | L5 | proxy + L4 | todo | depends 04/05 |

## Sequencing

```
00 Foundation  ──┐
                 ├─► 01 Blackbox engine ──┬─► 02 Screener
                 │                         └─► 03 Dashboard
                 └─ (universe + snapshot store serve all)

04 Monitor / 05 Stock-analysis / 06 Portfolios  → after paid-data decision
```

- **00 first** (universe-scan + daily snapshot store block all).
- Then **01 ‖ 02-UI-shell parallel** (server compute vs UI, low file conflict), converge when blackbox columns wire into screener.
- **04/05/06 gated** — plan the UI shells + stub data contracts now; fill when foreign-flow/fundamentals source bought.

## Key decisions (locked)

- **Anchor day = 2021-03-20** (cosmetic; daily OHLCV covers it). Pre-60-day flow = proxy.
- **Two normalizations:** anchor-from-base 0-1 (TMC long box level) + 50-session 0-100 (CHDMx, the Uốn trading signals). Store raw, derive on read.
- **Tốc độ = DM − DS** per cycle (derived, no new data).
- **MVP = phases 00→03** on OHLCV proxy. Validate curve vs price BEFORE buying data.

## Open questions

- Universe: VN30 only, or VN100? (have VN30 list + ~90 sector-map symbols; VN100 list TBD)
- Paid data source for L4/L5 (vnstock / TCBS / FiinTrade) — decide after Phase 1 proxy validation.
- Intraday proxy: use 60d 1m bars for recent DM precision, or daily-only proxy for consistency across full history?
