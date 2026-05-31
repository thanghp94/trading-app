# Phase 05 — Signal Detail Modal

## Overview
- Priority: P2. Depends on Phase 04.
- Screenshot 2 ("Xem chi tiết"): per-signal drilldown for one ticker.

## File
- create `src/web/components/SignalStudyDetail.tsx` (modal, opened from SignalStudyPanel).

## Layout (top → bottom)
1. Header: `{TICKER} | {signal labelVi}` + close X.
2. Price+volume chart (lightweight-charts, reuse Chart.tsx/MiniBacktestChart pattern):
   - close as area/line, volume histogram pane, red dot markers at `detail.eventIdx`.
   - data from StudyResult.closes/volumes/times.
3. "Phân tích chi tiết" — two columns:
   - Left "Thống kê biến động giá bình quân": optimal hold (T+{optimalAvgHorizon}),
     highest price change ({bestPeriod}), lowest ({worstPeriod}); horizontal bar list
     of avgByHorizon (T+3..T+180).
   - Right "Thống kê xác suất có lời": optimal win hold (T+{optimalWinHorizon}),
     highest/lowest win-prob; donut chart of `detail.donut` (win/breakeven/loss %)
     with center = total signals.
4. Two yearly tables:
   - "Lợi nhuận trung bình theo thời gian nắm giữ (%)": rows = years + Trung bình,
     cols = horizons + Trung bình → perYearAvg, green/red coloring.
   - "Xác suất có lời theo thời gian nắm giữ (%)": same shape → perYearWin.

## Reuse
- lightweight-charts setup + marker API from MiniBacktestChart.tsx.
- Donut: small inline SVG (no new dep) — 3 arcs.
- Color palette + table styles from VnBacktestPanel.

## Todo
- [ ] modal shell + header + close
- [ ] price/volume chart with event markers
- [ ] left stats column (bars + optimal/high/low)
- [ ] right win-prob column + donut SVG
- [ ] two per-year tables
- [ ] open/close wiring from grid

## Success criteria
- Click "Xem chi tiết" on any row → modal with chart markers + both stat columns + 2 tables.
- Matches screenshot 2 structure.

## Risks
- Marker density on 5y daily for frequent signals (volume breakout) → cap/cluster markers if laggy.
- Donut math: handle 0-total / all-win edge cases.
