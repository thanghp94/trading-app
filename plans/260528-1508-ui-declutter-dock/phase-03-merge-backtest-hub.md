# Phase 03 — Merge backtest cluster into one tabbed hub

**Priority:** P1
**Status:** Not started
**Depends on:** Phase 01

## Goal
Collapse 4 bottom-left launchers (VN Backtest, Saved Runs, Param Sweep, Portfolio) into a single
`📊 Backtest` dock button → drawer with tabs.

## Files to create
- `src/web/components/BacktestHub.tsx` — tab bar `[Run] [Saved] [Sweep] [Portfolio]` + active body.

## Files to modify (extract body, drop own launcher)
- `src/web/components/VnBacktestPanel.tsx` — keep body, remove `wrapStyle`/launcher (`:168,731`). Export body as `VnBacktestBody`.
- `src/web/components/BacktestRunsPanel.tsx` — remove `position:relative` launcher (`:67`), export body.
- `src/web/components/BacktestSweepPanel.tsx` — same.
- `src/web/components/BacktestPortfolioPanel.tsx` — same.
- `src/web/App.tsx` — replace 4 renders (`:175-178`) with single `<BacktestHub open onClose>`.

## Notes
- Bodies are large (VnBacktest ~750 lines). Extraction = move JSX into exported `*Body` fn,
  keep all hooks/fetch logic. Don't rewrite logic.
- Cross-panel link preserved: VnBacktest "save run" → Saved tab list (existing `/api/backtest/*`).
- Tab state local to `BacktestHub` (`useState<"run"|"saved"|"sweep"|"portfolio">`).

## Todo
- [ ] Extract `VnBacktestBody`
- [ ] Extract `BacktestRunsBody`
- [ ] Extract `BacktestSweepBody`
- [ ] Extract `BacktestPortfolioBody`
- [ ] `BacktestHub.tsx` tabs + render active body
- [ ] App.tsx: 4 renders → 1 hub
- [ ] Compile check + smoke-test each tab loads

## Success criteria
- One `📊 Backtest` dock button.
- All 4 features reachable via tabs, logic intact (run, save, sweep, portfolio).
- Bottom-left launcher stack gone.
