# Phase 03: Panel Shell + Wiring

**Priority:** High | **Status:** Todo | **Effort:** Medium
**Depends on:** Phase 02

## Files to Create

- `src/web/components/TickerDetailPanel.tsx`

## Files to Modify

- `src/web/use-dock.ts` — add `"ticker"` to PanelId
- `src/web/components/ChartCell.tsx` — add "📊" detail button to toolbar
- `src/web/App.tsx` — add `tickerSymbol` state + render `TickerDetailPanel`

---

## TickerDetailPanel.tsx

```tsx
interface Props {
  symbol: string | null;
  open: boolean;
  onClose: () => void;
}

export function TickerDetailPanel({ symbol, open, onClose }: Props) {
  const [candles, setCandles] = useState<IntradayCandle[] | null>(null);

  useEffect(() => {
    if (!open || !symbol) return;
    setCandles(null); // reset on symbol change

    const load = async () => {
      const res = await fetch(`/api/ticker/${symbol}/intraday`);
      if (!res.ok) return;
      const data = await res.json();
      setCandles(data.candles ?? []);
    };

    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [open, symbol]);

  const lastCandle = candles?.at(-1);
  const firstCandle = candles?.[0];
  const pct = firstCandle && lastCandle
    ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100
    : null;

  return (
    <Drawer open={open} onClose={onClose}
      title={symbol ?? "Ticker Detail"}
      hint={pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : undefined}
      width={720}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 160px)" }}>
        {/* Top: order book + volume profile side by side */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #2a2a2a", minHeight: 160 }}>
          <div style={{ flex: 1, borderRight: "1px solid #2a2a2a" }}>
            <TickerOrderBook depth={null} /> {/* depth=null for VN; pass real depth when available */}
          </div>
          <div style={{ flex: 1 }}>
            <TickerVolumeProfile candles={candles} />
          </div>
        </div>
        {/* KL/phút */}
        <div style={{ height: 160, borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
          <TickerVolumePerMin candles={candles} />
        </div>
        {/* Cumulative volume */}
        <div style={{ flex: 1 }}>
          <TickerCumVolume candles={candles} />
        </div>
      </div>
    </Drawer>
  );
}
```

---

## use-dock.ts

```typescript
export type PanelId =
  | "paper" | "strategy" | "backtest" | "journal"
  | "alerts" | "watchlist" | "chat" | "market"
  | "ticker"; // ← add
```

---

## ChartCell.tsx

Add button to toolbar (alongside existing triplet button):

```tsx
interface ChartCellProps {
  // ... existing props
  onTickerDetail?: (symbol: string) => void; // ← add
}

// In toolbar JSX, after triplet button:
{onTickerDetail && (
  <button type="button" onClick={() => onTickerDetail(cell.symbol)}
    title="Ticker detail — order book, volume profile"
    style={toolbarBtnStyle}>
    📊
  </button>
)}
```

---

## App.tsx

```tsx
// Add state:
const [tickerSymbol, setTickerSymbol] = useState<string | null>(null);

// Update cell render to pass onTickerDetail:
<ChartCell
  // ... existing props
  onTickerDetail={(sym) => { setTickerSymbol(sym); dock.open("ticker"); }}
/>

// Add panel render (alongside other panels):
<TickerDetailPanel
  open={dock.activePanel === "ticker"}
  symbol={tickerSymbol}
  onClose={dock.close}
/>
```

---

## Success Criteria

- Clicking 📊 on any ChartCell opens TickerDetailPanel for that symbol
- Opening another dock panel closes the ticker panel (existing dock behavior)
- Symbol change (clicking 📊 on different cell) resets panel and refetches
- Panel width 720px to fit all 4 sub-views comfortably
- TypeScript 0 errors
