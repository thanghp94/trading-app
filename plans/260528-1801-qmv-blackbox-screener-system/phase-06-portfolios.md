# Phase 06 — Portfolios (L5)

**Priority:** P4 (last). **Status:** todo. **Data:** proxy + L4 fundamentals (partial gate).

QMV30/QMV60 equal-weight tracking indices + personal 6-8 stock portfolios by investment style.

## Files

**Create**
- `src/server/portfolio/qmv-index.ts` — equal-weight index calc over a basket (QMV30/60), daily index value, change. 5 pillars: Tài chính, Bất động sản, Tiêu dùng, Hạ tầng, Ổn định (manual p41).
- `src/server/portfolio/store.ts` — SQLite basket membership + quarterly rebalance log (reuse journal.db pattern).
- `src/web/components/PortfolioPanel.tsx` — index chart vs VNINDEX, holdings table (Điểm/Rating/Pattern/valuation/phù hợp), rebalance view.

**Reuse**
- existing journal store pattern; Chart component; Phase 02 ★ rating for holdings.

## Scope

- **Now:** equal-weight index math, basket membership, index-vs-VNINDEX chart, holdings w/ blackbox ★.
- **Gated:** valuation/fundamental columns in holdings (from L4/L5).

## Todo

- [ ] qmv-index equal-weight calc + 5-pillar tagging
- [ ] basket store + quarterly rebalance log
- [ ] PortfolioPanel (index chart + holdings + rebalance)
- [ ] personal portfolio builder (6-8 stocks, by style — links Monitor presets)

## Success criteria

- QMV30/60 index tracks vs VNINDEX from proxy.
- Holdings show blackbox ★; valuation gated.
- Quarterly rebalance recorded.

## Risks

- Basket composition source (who picks QMV30?) — manual = QMV's review. For us: user-defined or auto top-★. Open question.

## Next

Final phase — depends on 02 (★) + 04/05 (fundamentals) for full holdings detail.
