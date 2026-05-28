# Phase 03 — Market Dashboard (L1)

**Priority:** P2. **Status:** todo. **Data:** proxy aggregates; foreign-flow + sentiment STUB.

Market-wide overview: total money (TM), shares-out (TS), Tốc độ, sector heatmap, breadth. The "góc nhìn nhanh" landing page.

## Files

**Create**
- `src/server/blackbox/market-aggregate.ts` — roll up per-symbol blackbox → market TM/TS/Tốc độ, breadth (% money-in), sector buckets (use `sector-map.ts` 11 sectors). DM0x/DS0x market-level.
- `src/web/components/MarketDashboardPanel.tsx` — VNINDEX/HNX/UPCOM strip, TM/TS/Tốc độ chart, sector heatmap (green/red), top-5 tables (tiền vào, nâng bậc, tốc độ, đảo chiều, N phiên).

**Reuse**
- existing chart components (`Chart.tsx`), `MarketOverviewPanel` if present (`plans/260528-1656-market-overview-panel`).

## Scope notes

- **Buildable now (proxy):** TM/TS/Tốc độ market+sector, breadth (lan tỏa), sector rotation, top-N money-in/out tables, MPIC pressure.
- **STUB until paid data:** Khối ngoại (foreign buy/sell), Dòng tiền chủ động Cáo/Sói/Thỏ (tick-level), Tâm lý thị trường (QMV-proprietary sentiment). Render placeholder + "gated".

## Todo

- [ ] market-aggregate (TM/TS/Tốc độ/breadth/sector)
- [ ] dashboard panel (charts + heatmap + top-N tables)
- [ ] foreign/active-flow/sentiment STUB blocks
- [ ] API + WS daily push

## Success criteria

- Dashboard shows market TM/TS trend + sector heatmap from proxy.
- Top-5 sector tables (tiền vào / N phiên) populate.
- Gated blocks clearly marked, not faked.

## Risks

- Aggregation cost over universe daily → precompute in daily-job, cache.

## Next

Foreign-flow block lights up when paid data lands (shared with L4).
