# TCBS Signal Study — Forward-Return Event Study

Replica of TCBS "Kiểm thử tín hiệu mua" (buy-signal backtest): per-ticker grid of
buy signals × holding horizons → average forward return + win-probability, plus a
per-signal drilldown view.

## Why this is NOT the existing backtest

`runBacktest` (src/server/backtest/backtest-engine.ts) is a **trade-management sim**:
entry, SL, TP, position sizing, fees → win/loss by stop-or-target.

TCBS is a **fixed-horizon forward-return event study**: for each signal, find every
historical bar where it fired, measure raw close-to-close return at fixed horizons
(T+3/5/10/20/60/180). No SL/TP/fees. It answers *"does this signal precede gains?"*
not *"can I profit after costs?"*. → New parallel engine, both kept.

## Scope (MVP — locked)

- IN: per-ticker signal grid + conclusion bullets + per-signal detail modal.
- OUT (future): `Toàn thị trường` market-wide aggregate, `Tín hiệu tự tạo`
  custom-signal builder (≈ existing dynamic-rule, fold in later).

## Decisions (locked)

1. **Overlap** → cooldown-dedupe consecutive fires of same signal (avoids correlated
   samples inflating confidence). Cooldown bars tunable per signal.
2. **Signal defs** → standard textbook defaults, params tunable.
3. **Forward return** → close[i+h] vs close[i]. Events too near series end skip that
   horizon. Output framed as *edge ranking*, not P&L promise; reuse `wilsonCi` /
   `SampleConfidence` for sample-size warning.

## 10 signals & indicator reuse

| Signal (VI) | indicator | status |
|---|---|---|
| Bùng nổ khối lượng | volumeSma | reuse (impulse-detector) |
| RSI quá bán | rsi | reuse |
| Giá giảm 15% / 20 phiên | close lookback | trivial |
| Giá giảm 15% vs MA20 | sma20 | reuse ema / trivial sma |
| Mở Band Bollinger | bollinger width | reuse |
| Uptrend | ema slope | reuse |
| SAR × MACD Histogram | parabolic-sar + macd | **new** |
| Lướt sóng với DMI | dmi/adx | **new** |
| Giá tăng + MACD Histogram | macd | **new** |
| Giá tăng + Stochastic RSI | stochastic-rsi | **new** |

## Phases

| # | File | Goal | Status |
|---|---|---|---|
| 1 | phase-01-indicators.md | 4 new indicators: macd, parabolic-sar, dmi, stochastic-rsi | ☐ |
| 2 | phase-02-engine.md | signal catalog + study engine + types | ☐ |
| 3 | phase-03-api.md | POST /api/signal-study (reuse DNSE fetch) | ☐ |
| 4 | phase-04-grid-ui.md | SignalStudyPanel grid + conclusion, new BacktestHub tab | ☐ |
| 5 | phase-05-detail-ui.md | SignalStudyDetail modal (chart + stats + donut + yearly) | ☐ |

## Key dependencies

- DNSE fetch path: copy pattern from src/server/index.ts:475 (`/api/backtest/vn`).
- Chart: lightweight-charts (Chart.tsx / MiniBacktestChart.tsx).
- Mount: new tab in src/web/components/BacktestHub.tsx.
- Horizons const `[3,5,10,20,60,180]` shared server+client.
