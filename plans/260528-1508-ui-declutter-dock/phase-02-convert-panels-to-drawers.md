# Phase 02 — Convert panels to controlled drawers (unblock chart)

**Priority:** P0
**Status:** Not started
**Depends on:** Phase 01

## Goal
Make Paper Trading, Strategy Builder, Journal, Alerts, Watchlist controlled by the dock.
Drop their private open-state + fixed corner styles. Chart 1 stops being covered.

## Pattern (apply to each panel)
1. Remove internal `useState` for expanded/open and the fixed launcher `<button>`.
2. Remove the corner `position: fixed` wrapper style.
3. Accept `{ open, onClose }` props; wrap body in `<Drawer open title onClose>`.
4. App renders panel always but Drawer shows only when `activePanel === id`.

## Files to modify
- `src/web/components/PaperTradingPanel.tsx` — drop `expanded` (`:6`), drop `panelStyle` fixed (`:172`). **Removes chart-1 block.**
- `src/web/components/StrategyBuilderPanel.tsx` — drop fixed (`:192`). **Removes chart-1 block.**
- `src/web/components/JournalPanel.tsx` — drop fixed (`:229`).
- `src/web/components/AlertPanel.tsx` — drop fixed (`:169`); badge count → dock.
- `src/web/components/WatchlistPanel.tsx` — drop fixed (`:122`); badge count → dock.
- `src/web/App.tsx` — pass `open={activePanel==="..."} onClose={close}` to each.

## Notes
- Keep all business logic / hooks (`useJournal`, `useAlerts`, etc.) untouched.
- Alerts/Journal/Watchlist current colored bars become dock buttons → mute to icon+count.
- `onClear`/`onPick` callbacks stay; just relocated into the drawer body.

## Todo
- [ ] PaperTradingPanel → controlled drawer
- [ ] StrategyBuilderPanel → controlled drawer
- [ ] JournalPanel → controlled drawer
- [ ] AlertPanel → controlled drawer (+ badge)
- [ ] WatchlistPanel → controlled drawer (+ badge)
- [ ] App.tsx wiring for all five
- [ ] Compile check + visual: chart 1 top-left clear

## Success criteria
- Chart 1 fully visible — no Paper/Strategy overlay.
- Only one drawer open at a time.
- All five reachable from dock; counts show on dock badges.
