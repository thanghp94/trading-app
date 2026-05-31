# Phase 03: Frontend Panel

**Priority:** High | **Status:** Todo | **Effort:** Large
**Depends on:** Phase 02

## Files to Create

- `src/web/components/MarketOverviewPanel.tsx` — shell, 3-tab switcher, data fetching
- `src/web/components/MarketTreemap.tsx` — sector treemap + pie + money flow bars
- `src/web/components/MarketLiquidity.tsx` — cumulative volume area chart
- `src/web/components/MarketForeign.tsx` — foreign flow bars + net table

## Dependencies to Add

```bash
pnpm add d3-hierarchy
pnpm add -D @types/d3-hierarchy
```

---

## MarketOverviewPanel.tsx (shell)

```tsx
type MarketTab = "breadth" | "liquidity" | "foreign";

export function MarketOverviewPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<MarketTab>("breadth");
  const [breadthData, setBreadthData] = useState<BreadthResponse | null>(null);
  const [liquidityData, setLiquidityData] = useState<LiquidityResponse | null>(null);
  const [foreignData, setForeignData] = useState<ForeignResponse | null>(null);

  // Poll every 20s when panel is open
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      if (tab === "breadth") { /* fetch /api/market/breadth */ }
      if (tab === "liquidity") { /* fetch /api/market/liquidity */ }
      if (tab === "foreign") { /* fetch /api/market/foreign */ }
    };
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [open, tab]);

  return (
    <Drawer open={open} onClose={onClose} title="Thị trường">
      {/* Tab bar: Biến động | Thanh khoản | Khối ngoại */}
      <div className="flex gap-2 px-3 py-2 border-b border-zinc-800 text-sm">
        {(["breadth","liquidity","foreign"] as MarketTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? "text-white font-medium" : "text-zinc-500 hover:text-zinc-300"}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "breadth" && <MarketTreemap data={breadthData} />}
        {tab === "liquidity" && <MarketLiquidity data={liquidityData} />}
        {tab === "foreign" && <MarketForeign data={foreignData} />}
      </div>
    </Drawer>
  );
}

const TAB_LABELS: Record<MarketTab, string> = {
  breadth: "Biến động",
  liquidity: "Thanh khoản",
  foreign: "Khối ngoại",
};
```

---

## MarketTreemap.tsx

### Layout: d3-hierarchy squarified treemap

```tsx
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";

// Group stocks by sector → build hierarchy
// { name: "root", children: [{ name: "Tài chính", children: [{ symbol, value, pctChange }] }] }

function buildHierarchy(stocks: StockSnapshot[]) {
  const sectors: Record<string, StockSnapshot[]> = {};
  for (const s of stocks) {
    (sectors[s.sector] ??= []).push(s);
  }
  return {
    name: "root",
    children: Object.entries(sectors).map(([name, children]) => ({
      name,
      children: children.map(s => ({ ...s, value: s.value })),
    })),
  };
}

// Color scale: pctChange → red/green
function heatColor(pct: number): string {
  if (pct > 6.5) return "#00c853";   // ceiling hit
  if (pct > 3) return "#4caf50";
  if (pct > 0) return "#81c784";
  if (pct === 0) return "#616161";
  if (pct > -3) return "#ef9a9a";
  if (pct > -6.5) return "#e53935";
  return "#b71c1c";                  // floor hit
}
```

### Sub-components in same file

1. **Treemap canvas** — SVG rects sized by trading `value`, colored by `pctChange`
2. **Pie chart** — Recharts? No — draw with SVG arcs directly (no extra dep):
   ```tsx
   // Simple 3-slice SVG pie: advance (green) / decline (red) / unchanged (gray)
   // ~30 lines, no library needed
   ```
3. **Money flow bars** — horizontal SVG bars: Tăng / Giảm / Khối ngoại net

### Treemap rendering

```tsx
// useResizeObserver on container div → recompute layout on resize
const root = hierarchy(buildHierarchy(stocks))
  .sum(d => (d as any).value ?? 0)
  .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

treemap<TreeNode>()
  .tile(treemapSquarify)
  .size([width, height])
  .padding(1)
  .paddingTop(18)  // sector label space
  (root);

// Render: sector groups as <g> with label, leaf nodes as <rect>+<text>
```

---

## MarketLiquidity.tsx

Use **lightweight-charts** (already installed) with two area series:

```tsx
import { createChart, ColorType } from "lightweight-charts";

// On mount: create chart, add two area series
const todaySeries = chart.addAreaSeries({
  lineColor: "#26a69a",
  topColor: "rgba(38,166,154,0.3)",
  bottomColor: "rgba(38,166,154,0.0)",
});
const yesterdaySeries = chart.addAreaSeries({
  lineColor: "#ef5350",
  topColor: "rgba(239,83,80,0.1)",
  bottomColor: "rgba(239,83,80,0.0)",
  lineStyle: 1,  // dashed
});

// Map LiquidityPoint[] → { time, value } for each series
todaySeries.setData(today.map(p => ({ time: p.time, value: p.cumVol })));
yesterdaySeries.setData(yesterday.map(p => ({ time: p.time, value: p.cumVol })));

// Legend overlay: "Hôm qua ── Hôm nay ──"
```

Chart options: dark theme, no crosshair labels on yesterday series, time axis 09:00–15:00.

---

## MarketForeign.tsx

Layout: two sections

**Top — Bar chart** (SVG, no lib):
- X axis: sectors
- Two bars per sector: Mua (green) / Bán (red) in VND billion
- Net label above each group

**Bottom — Summary table**:
```
| Sàn   | Mua (tỷ) | Bán (tỷ) | Ròng (tỷ) |
|-------|----------|----------|-----------|
| HSX   | 1,234    | 987      | +247      |
| HNX   | 123      | 98       | +25       |
| UPCOM | 45       | 67       | -22       |
```

Color ròng: green if positive, red if negative.

---

## Skeleton / Loading State

All 3 sub-components accept `data: T | null`. When null → show pulsing gray placeholder rects (CSS `animate-pulse`).

## Success Criteria

- Treemap renders with correct sector grouping and red/green colors
- Pie shows advance/decline/unchanged counts
- Liquidity chart renders two area series with time axis
- Foreign tab shows bars + table
- All tabs show skeleton while loading, not blank
- Panel opens/closes via dock without layout shift
