# Phase 04 — Monitor (Investor view, L3')

**Priority:** P3. **Status:** todo. **Data:** GATED on fundamentals (paid).

QMV Monitor = investor superset of Screener: adds business-quality, valuation, policy-cycle, portfolio-builder criteria. Same scan engine, more filter groups.

## Gating

Needs fundamentals (PE/PB/ROE/ROAA/EPS/leverage) + valuation → **paid data** (vnstock/TCBS/FiinTrade). Build UI shell + filter contracts now; data fills after source decision (see plan.md open questions). Do NOT fake fundamentals.

## Files

**Create**
- `src/server/screener/monitor-filters.ts` — extra predicate groups: Kiểu danh mục (Giá trị/Tăng trưởng/Giao dịch), Chu kỳ chính sách (Nới lỏng/Chuyển dịch/Thắt chặt), Chất lượng DN, Định giá, Luân chuyển.
- `src/web/components/MonitorPanel.tsx` — full QMV Monitor filter grid + portfolio-template presets (Value / Growth-Momentum / Contrarian-Distressed / News-driven per manual p12).

**Reuse**
- Phase 02 `ScreenerPanel`/`run.ts`/`filters.ts` — Monitor = Screener + extra groups + fundamental columns.

## Portfolio templates (manual p12, encode as preset filter sets)

```
Value:        định giá Vùng đầu tư + Thấp-so-ngành, DN tốt 3★, KQKD nỗ lực, thanh khoản tốt
Growth:       Uptrend, BB tiền khỏe, vùng giá có thể mua, DN tốt 3★, thanh khoản tốt
Contrarian:   Downtrend, BB tiền yếu, vùng giá có thể mua + đầu tư, DN tốt 3★
News-driven:  đột biến BCTC lợi nhuận, vùng giá có thể mua, thanh khoản tốt
```

## Todo

- [ ] monitor-filters predicate groups (logic ready, fundamental inputs gated)
- [ ] MonitorPanel UI + portfolio presets
- [ ] fundamental columns (STUB → fill on data)
- [ ] valuation gating wired to Phase 05

## Success criteria

- Monitor renders all QMV filter groups + 4 portfolio presets.
- Blackbox/TA filters work now; fundamental filters disabled w/ "needs data" until Phase 05.

## Risks

- Tempting to fake PE/PB → don't. Gate explicitly.

## Next

Lights up fully once Phase 05 fundamentals land.
