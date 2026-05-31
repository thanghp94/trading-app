# Phase 04: Dock Integration

**Priority:** High | **Status:** Todo | **Effort:** Small
**Depends on:** Phase 03

## Files to Modify

- `src/web/use-dock.ts` — add `"market"` to `PanelId`
- `src/web/components/DockBar.tsx` — add button to `BUTTONS`
- `src/web/App.tsx` — import + render `MarketOverviewPanel`

## Changes

### use-dock.ts

```typescript
export type PanelId =
  | "paper"
  | "strategy"
  | "backtest"
  | "journal"
  | "alerts"
  | "watchlist"
  | "chat"
  | "market";   // ← add
```

### DockBar.tsx

```typescript
const BUTTONS: DockButtonDef[] = [
  { id: "paper",    icon: "💼", label: "Paper",    tier: "core" },
  { id: "journal",  icon: "📓", label: "Journal",  tier: "core" },
  { id: "alerts",   icon: "🔔", label: "Alerts",   tier: "core" },
  { id: "watchlist",icon: "🎯", label: "Watchlist",tier: "core" },
  { id: "chat",     icon: "💬", label: "Chat",     tier: "core" },
  { id: "market",   icon: "🗺️", label: "Market",   tier: "core" },  // ← add
  { id: "strategy", icon: "⚙️", label: "Strategy", tier: "advanced" },
  { id: "backtest", icon: "📊", label: "Backtest", tier: "advanced" },
];
```

### App.tsx

```tsx
import { MarketOverviewPanel } from "./components/MarketOverviewPanel.js";

// Inside JSX, alongside other panels:
<MarketOverviewPanel
  open={dock.activePanel === "market"}
  onClose={dock.close}
/>
```

## Success Criteria

- "Market" button visible in dock bar
- Clicking opens MarketOverviewPanel, clicking again or opening another panel closes it
- No TypeScript errors on `PanelId` usage
