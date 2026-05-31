# Phase 04 — Polish: chart toolbar overflow + entry-label density (OPTIONAL)

**Priority:** P2 (defer until 1-3 land)
**Status:** Not started

## Goal
Trim per-chart toolbar noise and the stacked BEAR/BULL ENTRY price labels.

## Toolbar (`src/web/components/ChartCell.tsx:112-235`)
Currently ~10 controls per chart: EMA, HTF, HA, Ẩn lệnh, Triplet, Analyze, Backtest, Replay,
zones tag, symbol, TF, close.
- Keep visible: symbol, TF, Ẩn lệnh, Replay, close.
- Move into `⋯` overflow menu: EMA, HTF, HA, Triplet, Analyze, Backtest.

## Entry labels
Screenshot shows 10+ BEAR/BULL ENTRY labels stacked on chart 1 (every order line gets a label).
- Option A: `Ẩn lệnh` already toggles trade lines — verify it also hides labels.
- Option B: collapse adjacent labels within N px into one "N orders" pill.
- Option C: show label only on hover, line always drawn.
Recommend A first (cheapest), then C if still noisy.

## Todo
- [ ] Toolbar overflow `⋯` menu
- [ ] Verify `Ẩn lệnh` hides labels too
- [ ] Label collapse/hover (only if needed)

## Success criteria
- Toolbar shows ≤5 controls; rest in overflow.
- Chart 1 entry labels readable, not a stacked wall.

## Note
Skip entirely if dock + hub already make the UI feel clean.
