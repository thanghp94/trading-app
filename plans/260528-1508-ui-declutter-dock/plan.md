# UI Declutter — Unified Bottom Dock

**Goal:** Kill the 9 always-on floating panels scattered across screen corners. Replace with one
bottom dock + single-open drawers. Stop Paper Trading / Strategy Builder from covering chart 1.

**Status:** Phases 1-3 implemented (typecheck + tests + build pass). Phase 4 deferred.
**Branch:** main
**Owner:** thang

---

## Problem (verified in code)

`App.tsx:171-180` renders 9 panels as siblings. Each owns its own `position: fixed` corner +
its own open/close `useState`. No coordination — they all show at once, pile in corners, and two
sit directly on top of the left chart.

| Panel | File:line | Where it pins | Issue |
|---|---|---|---|
| Paper Trading | `PaperTradingPanel.tsx:174` | `left:12 top:50` | **covers chart 1** |
| Strategy Builder | `StrategyBuilderPanel.tsx:193` | `left:12 top:120` | **covers chart 1** |
| VN Backtest | `VnBacktestPanel.tsx` (in-flow) | bottom-left | 1 of 4 backtest buttons |
| Saved Runs | `BacktestRunsPanel.tsx` (in-flow) | bottom-left | redundant launcher |
| Param Sweep | `BacktestSweepPanel.tsx` (in-flow) | bottom-left | redundant launcher |
| Portfolio | `BacktestPortfolioPanel.tsx` (in-flow) | bottom-left | redundant launcher |
| Journal | `JournalPanel.tsx:230` | `left:12 bottom:12` | big colored bar |
| Alerts | `AlertPanel.tsx:170` | `right:12 bottom:12` | big colored bar |
| Watchlist | `WatchlistPanel.tsx:124` | `right:12 top:12` | big colored bar |

Shared styling already exists: `.panel-glass`, `.panel-header-btn`, CSS vars in `index.css:48-70`.
Reuse them — no new design system.

---

## Current vs Proposed

### Current (cluttered)
```
┌──────────────────────────── header ───────────────────────────┐
│ Trading App  PnL  [sessions]  ☀  cols +Chart Reset Save   [⭐Watchlist]│
├──────────────┬──────────────┬──────────────────────────────────┤
│ [💼 Paper]   │   chart 2    │   chart 3                         │
│ [⚙ Strategy] │              │                                   │
│   chart 1 ←──┼─ blocked     │                                   │
│              │              │                                   │
│ [VN Backtest]│              │                                   │
│ [Saved Runs] │              │                                   │
│ [Param Sweep]│              │                                   │
│ [Journal 70] │              │                        [Alerts 68]│
└──────────────┴──────────────┴──────────────────────────────────┘
   7 launchers in corners + 2 overlapping chart 1
```

### Proposed (one dock, single-open drawers)
```
┌──────────────────────────── header ───────────────────────────┐
│ Trading App  PnL  [sessions]  ☀  cols +Chart Reset Save      ? │
├──────────────┬──────────────┬──────────────────────────────────┤
│   chart 1    │   chart 2    │   chart 3                         │
│  (clear)     │              │                                   │
│              │              │                                   │
├──────────────┴──────────────┴──────────────────────────────────┤
│ 💼 Paper  ⚙ Strategy  📊 Backtest▾  📓 Journal 70  🔔 Alerts 68  ⭐ Watchlist │  ← dock
└────────────────────────────────────────────────────────────────┘
   click → drawer slides up above dock. One open at a time. Esc / click-away closes.
```

### Backtest hub (4 buttons → 1)
```
┌ 📊 Backtest ───────────────────────────────────── ✕ ┐
│ [ Run ] [ Saved ] [ Sweep ] [ Portfolio ]            │
│ … active tab body (existing panel content) …         │
└──────────────────────────────────────────────────────┘
```

---

## Architecture

- **`DockBar`** (new) — fixed thin bar, full chart-width, flex row of buttons w/ count badges.
- **State lift** — single `activePanel: PanelId | null` in `App.tsx` (or small `use-dock.ts`).
  Replaces each panel's private open state → enforces single-open accordion.
- **`Drawer`** (new, thin wrapper) — anchors content above the dock, `max-height` + scroll,
  reuses `.panel-glass`. Panels render their existing body inside it.
- **Panels become controlled** — drop internal `useState` + fixed corner styles; take `open`/`onClose`.
- **Backtest hub** — one panel w/ tabs hosting the 4 existing bodies (logic unchanged).

No backend changes. No new deps. Pure web/components refactor.

---

## Phases

| Phase | File | Scope | Status |
|---|---|---|---|
| 1 | `phase-01-dock-shell-and-state.md` | DockBar + activePanel state + Drawer wrapper | ✅ done |
| 2 | `phase-02-convert-panels-to-drawers.md` | Paper/Strategy/Journal/Alerts/Watchlist → controlled; unblock chart | ✅ done |
| 3 | `phase-03-merge-backtest-hub.md` | VN/Saved/Sweep/Portfolio → one tabbed hub | ✅ done |
| 4 (opt) | `phase-04-polish-toolbar-labels.md` | Chart toolbar overflow ⋯ + BEAR/BULL label density | ⏸ deferred |

### Files touched
- New: `use-dock.ts`, `components/Drawer.tsx`, `components/DockBar.tsx`, `components/BacktestHub.tsx`
- Controlled drawers: `PaperTradingPanel`, `StrategyBuilderPanel`, `JournalPanel`, `AlertPanel`, `WatchlistPanel`
- Embeddable (tab bodies): `VnBacktestPanel`, `BacktestRunsPanel`, `BacktestSweepPanel`, `BacktestPortfolioPanel`
- Wiring: `App.tsx` (dock state, lifted `useJournal`, root bottom padding)

Recommended order: 1 → 2 → 3. Phase 4 only if still noisy after.

---

## Design principle (locked)

**Progressive disclosure — never overwhelm.** Default surface = clean charts + a thin dock.
Everything else hidden until the user asks for it. User must be able to learn ONE feature at a
time without a wall of controls. Rules:
- No always-on floating panels. Every feature lives behind a dock button.
- One drawer open at a time (accordion). Opening a new one closes the last.
- Each drawer shows a **one-line hint** under its title (what it does) so an unfamiliar feature
  is learnable the moment it opens.
- Dock grouped into tiers so the eye isn't hit with everything:
  `[ 💼 Paper · 📓 Journal · 🔔 Alerts · ⭐ Watchlist ]   |   [ ⚙ Strategy · 📊 Backtest▾ ]`
  core (daily use) left, advanced (occasional) right of a divider.

## Decisions (locked)

1. **Drawer direction** — slide UP above dock (KISS; no chart-grid resize).
2. **Watchlist** — folded into dock (core tier). One place for everything.
3. **Dock** — full chart-width, thin, single row with a tier divider.
4. **Phase 4** — deferred. Ship 1→3 first, reassess if still noisy.

## Open questions

None — defaults locked per progressive-disclosure principle. Adjust on request before/after build.
