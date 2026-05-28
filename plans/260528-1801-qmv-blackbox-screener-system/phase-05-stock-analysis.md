# Phase 05 — Stock Analysis (L4)

**Priority:** P3. **Status:** todo. **Data:** GATED — fundamentals + foreign-flow (paid).

Per-stock deep view: fundamentals, 3-way valuation, signal tables, foreign + active-flow charts, blackbox charts. The "click a symbol" detail page.

## Gating

Heaviest paid-data dependency. Buildable-now parts = blackbox charts (Phase 01) + TA signal tables. Fundamentals/valuation/foreign/active-flow = STUB until data source bought.

## Files

**Create**
- `src/server/fundamentals/types.ts` — data contracts: `Financials` (EPS/ROE/ROAA/leverage/PE/PB/profit), `Valuation` (3 methods), `QuarterlyAnomaly` (6 ★ metrics). Interface only; impl on data.
- `src/server/fundamentals/provider.ts` — adapter interface `FundamentalsProvider` (impl later: vnstock/TCBS).
- `src/web/components/StockAnalysisPanel.tsx` — tabs: Tổng quan DN (Lợi nhuận vs EPS, đòn bẩy, ROE, ROAA), Đột biến KQKD (★ table), Định giá (3-way), Kỹ thuật (Max Buy/Target/SL/Buy-Sell Pattern/Rule), BB Tích cực/Tiêu cực, Xu hướng giao dịch, Khối ngoại, Dòng tiền chủ động, Blackbox charts.

**Reuse — buildable now**
- Phase 01 blackbox → TMC/DMx/DSx/DSPI/MPIC charts (the views in the screenshots user shared).
- Phase 01 `signals.ts` → BB Tích cực/Tiêu cực table, Xu hướng giao dịch table.
- TA: pattern/zone/impulse → Kỹ thuật signal rows (Buy/Sell Pattern).

## Buildable-now vs gated

| Section | Now (proxy) | Gated (paid) |
|---|---|---|
| Blackbox charts (TMC/DM/DS/DSPI/MPIC) | ✅ | — |
| BB Tích cực/Tiêu cực, Xu hướng giao dịch | ✅ | — |
| Kỹ thuật (Pattern/Rule/Target/SL) | ✅ TA | — |
| Tổng quan DN (EPS/ROE/ROAA/đòn bẩy) | — | ✅ |
| Định giá 3-way | — | ✅ |
| Khối ngoại (foreign) | — | ✅ |
| Dòng tiền chủ động (Cáo/Sói/Thỏ) | — | ✅ tick |

## Todo

- [ ] fundamentals data contracts (interface)
- [ ] StockAnalysisPanel shell w/ tabs
- [ ] wire blackbox charts + signal tables (now)
- [ ] fundamentals/valuation/foreign tabs STUB
- [ ] FundamentalsProvider impl (post data decision)

## Success criteria

- Click symbol → blackbox charts + signal tables render from proxy (matches user's screenshots).
- Fundamental tabs present but gated.

## Risks

- Big surface — ship blackbox+signal tabs first, gated tabs last.

## Next

Provider impl unblocks Monitor (04) fundamental filters too.
