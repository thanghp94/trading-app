# Phase 04 — Summary Grid UI

## Overview
- Priority: P1. Depends on Phase 03.
- Screenshot 1: conclusion bullets + signal × horizon grid with per-row green heatmap +
  "Xem chi tiết" button per row. New tab in BacktestHub.

## Files
- create `src/web/components/SignalStudyPanel.tsx`
- modify `src/web/components/BacktestHub.tsx` — add tab `{ id: "signals", label: "Signals" }` →
  `{tab === "signals" && <SignalStudyPanel embedded />}`.

## SignalStudyPanel layout
- Controls: symbol input (default ORS/TPB), From/To date, Run button → POST /api/signal-study.
- Conclusion box (matches TCBS "Kết luận của mã"):
  - "Chiến lược ngắn hạn: {signal} đem lại LN cao nhất {x}% khi nắm giữ {h} ngày"
  - "Chiến lược dài hạn: ..." + "Trong 7 ngày vừa qua {có/không} xuất hiện tín hiệu".
- Grid: rows = SignalRow, cols = 3/5/10/20/60/180 + "Trung bình".
  - cell = avg % (1 decimal), color green ≥0 / red <0 (reuse existing palette #26a69a / #ef5350).
  - per-row best cell highlighted with green bg tint (TCBS dark-green cell) — max of row.
  - "—" for null cells (TCBS shows blank/dash on thin samples).
- Selector for value type later (LN trung bình / win-prob) — MVP: avg-return only, win-prob in detail.
- Each row trailing button "Xem chi tiết" → opens detail modal (Phase 05) with that signal's detail.

## Reuse
- Bilingual labels from SignalRow (labelVi primary, EN tooltip).
- `SampleConfidence` / sample badge for low-N signals.
- Styling tokens from VnBacktestPanel.

## Todo
- [ ] SignalStudyPanel.tsx (controls + conclusion + grid)
- [ ] heatmap per-row-max highlight
- [ ] BacktestHub tab wired
- [ ] open detail modal on Xem chi tiết

## Success criteria
- Run ORS → grid renders 10 rows, conclusion bullets populated, best-cell highlighted.
- Matches screenshot 1 structure (not pixel-exact).

## Risks
- Heatmap "best per row" must ignore null cells.
- Keep panel within Drawer width 780 — grid scroll-x if needed.
