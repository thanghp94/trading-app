# Phase 01 — Dock shell + state + Drawer wrapper

**Priority:** P0 (foundation)
**Status:** Not started

## Goal
Create the bottom dock bar, the single-open state, and a reusable Drawer wrapper. No panel
behavior changes yet — dock buttons just toggle `activePanel`.

## Files to create
- `src/web/components/DockBar.tsx` — fixed bottom bar, flex row of buttons + count badges.
- `src/web/components/Drawer.tsx` — content wrapper anchored above dock (`.panel-glass`, max-height, scroll, ✕ + Esc close).
- `src/web/use-dock.ts` — `activePanel` state + `open(id)`, `close()`, `toggle(id)`.

## Files to modify
- `src/web/App.tsx` — import `useDock` + `DockBar`; render `<DockBar>` once; remove header `?`/guide crowding only if needed.

## Types
```ts
export type PanelId = "paper" | "strategy" | "backtest" | "journal" | "alerts" | "watchlist";
```

## DockBar contract
```tsx
interface DockButton { id: PanelId; icon: string; label: string; badge?: number; tier: "core" | "advanced"; }
interface DockBarProps { active: PanelId | null; onSelect: (id: PanelId) => void; badges: Partial<Record<PanelId, number>>; }
```
- Two tiers w/ a vertical divider: core = Paper, Journal, Alerts, Watchlist; advanced = Strategy, Backtest.
- Active button gets highlighted state.
- Badge counts: journal trades, alerts count, watchlist count (pull from existing hooks in App).

## Drawer contract
```tsx
interface DrawerProps { open: boolean; title: string; hint?: string; onClose: () => void; children: React.ReactNode; width?: number; }
```
- `position: fixed; bottom: <dock height>; left: 12;` anchored above dock.
- Renders title + optional one-line `hint` (muted) so unfamiliar features explain themselves on open.
- Esc key + click-outside → `onClose`. Single instance per open panel.

## Todo
- [ ] `use-dock.ts` with `activePanel` + open/close/toggle
- [ ] `Drawer.tsx` reusing `.panel-glass`, Esc + click-away close
- [ ] `DockBar.tsx` with buttons + badges, active highlight
- [ ] Wire into `App.tsx`, pass badge counts from `useAlerts`/`useJournal`/watchlist
- [ ] Compile check (`tsc`)

## Success criteria
- Dock renders at bottom, full width, one row.
- Clicking a button sets `activePanel`; clicking again or Esc clears it.
- No regression to chart grid layout.
