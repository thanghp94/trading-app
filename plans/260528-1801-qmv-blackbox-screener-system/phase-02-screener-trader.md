# Phase 02 — Screener (Trader view, L3)

**Priority:** P1. **Status:** todo. **Data:** proxy + existing TA.

The trader-facing QMV Screener: scan universe → filter on blackbox + TA signals → ranked table with ★ rating. UI shell buildable in parallel with Phase 01; columns wire in as engine lands.

## Files

**Create — server**
- `src/server/screener/score.ts` — composite ★ rating per [blackbox-math.md](./blackbox-math.md#composite--rating).
- `src/server/screener/filters.ts` — predicates for QMV checkbox groups (Tín hiệu giao dịch, Dòng tiền vào/ra, Xu hướng giá, Tương quan cung cầu, Hệ thống giao dịch, Dự báo).
- `src/server/screener/run.ts` — `runScreener(universe, filters): ScreenerRow[]` (joins blackbox + TA + price).

**Create — web**
- `src/web/components/ScreenerPanel.tsx` — filter checkbox panel (left) + results table (right). Match QMV layout.
- `src/web/components/screener-columns.ts` — column defs: Đóng cửa, %, KL, PE/PB (stub), Tốc độ, Tiền vào hôm nay/2/3 phiên, Uốn lên/xuống, đảo chiều T+, Bullish/Bearish Pattern/Signal, KL đột biến, ★ QMV Rating, theo dõi.

**Reuse — TA already in repo**
- `src/shared/indicators/pattern-detector.ts` → Bullish/Bearish Pattern.
- `rsi.ts` → bend confirm; `impulse-detector.ts` → KL đột biến (volume spike); `sr-zone-tracker.ts` → cầu/cung tại HT/KC.
- existing scanner `scoreOne` (`watchlist-scanner.ts`) — extend, don't fork.
- existing panel components (`WatchlistPanel.tsx`, `BacktestPanel.tsx`) — copy table/filter patterns.

## Steps

1. `screener-columns.ts` + `ScreenerPanel.tsx` shell with **TA-only** columns (parallel w/ Phase 01).
2. `filters.ts` predicate map (each QMV checkbox → boolean fn over a row).
3. `score.ts` composite ★ (start TA weights, add blackbox terms when engine ready).
4. `run.ts` — pull universe → blackbox + TA → apply filters → rank.
5. API route in `src/server/index.ts` (`GET /screener?filters=…`) + WS push on daily recompute.
6. Wire blackbox columns (Tốc độ/Uốn/tiền-vào) once Phase 01 validated.

## QMV filter groups → predicate (filters.ts)

```
Tín hiệu: uốn-lên-20/30, uốn-xuống-70/80, bullish/bearish pattern+signal, KL đột biến
Dòng tiền: tiền vào hôm nay / 2 / 3 phiên, ra …, đảo chiều T+, mua lên/bán xuống, NN mua/bán[STUB]
Xu hướng giá: uptrend/downtrend/sideways/new-low/new-high
Cung cầu: cầu mạnh/yếu, kéo xả/đạp kéo, uốn HT/KC, cầu mạnh@HT, cung mạnh@KC
Hệ thống: cấu trúc nền tốt/xấu, chỉ số tốt/xấu, ichimoku tốt/xấu[needs Ichimoku — add], phân kỳ[needs MACD-div — add]
Dự báo: cầu khỏe/bão hòa/yếu/duy trì, BB-Status, dấu hiệu vào/ra
```

## New indicators required (small, add to `src/shared/indicators/`)

- `ichimoku.ts` (Ichimoku tốt/xấu)
- `divergence.ts` (phân kỳ dương/âm + ẩn — MACD/RSI divergence)

## Todo

- [x] score ★ from TA signals (`screener/score.ts`)
- [x] TA signal block (`screener/ta-signals.ts` — trend/pattern/vol-spike/rsi/zone/hi-lo)
- [x] run over universe + `GET /api/screener?universe=vn30|tracked` (server core)
- [x] blackbox display columns wired (proxy-flagged, display-only)
- [x] smoke validated (`scripts/smoke-screener.ts` — VHM ★4 matches QMV screenshot)
- [ ] React `ScreenerPanel.tsx` + columns (NEXT)
- [ ] filter checkbox predicate map (QMV groups)
- [ ] ichimoku.ts, divergence.ts (for Ichimoku tốt/xấu, phân kỳ columns)
- [ ] unit tests + code-review

## Success criteria

- Scan VN30 → table ranked by ★, all QMV columns present (NN/PE/PB stubbed).
- Filters compose (AND, per QMV "lọc loại trừ" — must meet ALL chosen).
- Matches screenshot layout + neat (progressive disclosure — see memory).

## Risks

- Filter combinatorics → keep predicates pure, compose at query.
- NN/PE/PB columns empty until paid data → show "—" + tooltip "proxy/gated", don't fake.

## Next

03 Dashboard reuses scan; 04 Monitor = investor filters on same engine.
