# Phase 02: Ticker Sub-view Components

**Priority:** High | **Status:** Todo | **Effort:** Large
**Depends on:** Phase 01

## Files to Create

- `src/web/components/TickerOrderBook.tsx`
- `src/web/components/TickerVolumePerMin.tsx`
- `src/web/components/TickerCumVolume.tsx`
- `src/web/components/TickerVolumeProfile.tsx`

---

## Shared Type (define in TickerDetailPanel.tsx, import here)

```typescript
export interface IntradayCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}
```

---

## TickerOrderBook.tsx

Receives `depth: DepthSnapshot | null`. For VN symbols depth will be null.

```
Layout (side by side):
┌─────────────────────────────────────┐
│ KL Mua    Giá Mua  │  Giá Bán  KL Bán │
│ 1,500     40.25    │  40.50    7,900  │  ← green left / red right
│ 6,100     40.20    │  40.60    5,200  │
│   600     40.15    │  40.65   14,200  │
└─────────────────────────────────────┘
```

- 3 rows max (top 3 bids, top 3 asks)
- Volume bar fills cell background proportionally (max vol in view = 100% width)
- If `depth === null`: show "Dữ liệu sổ lệnh chưa hỗ trợ cho thị trường VN"
- Prices formatted: VND thousands → `40.25` display (already stored as full VND, divide by 1000 for display)

```tsx
function fmtPrice(p: number) { return (p / 1000).toFixed(2); }
function fmtVol(v: number) { return v >= 1000 ? `${(v/1000).toFixed(1)}K` : String(v); }
```

---

## TickerVolumePerMin.tsx (KL/phút)

Uses **lightweight-charts Histogram series**. Same pattern as existing Chart.tsx `HistogramSeries`.

```typescript
// Color each bar by price direction (close vs open of that 1m candle)
const color = c.close >= c.open ? "#26a69a" : "#ef5350";
series.setData(candles.map(c => ({ time: c.time as UTCTimestamp, value: c.volume, color })));
```

- Init chart once (empty deps), update data in second effect — same pattern as MarketLiquidity
- ResizeObserver on container
- Y-axis: volume formatted as K/M
- Height: ~160px

---

## TickerCumVolume.tsx (Khối lượng tích lũy)

Identical pattern to `MarketLiquidity` but for a single symbol, no yesterday overlay.

```typescript
// Accumulate volume minute by minute
let cum = 0;
const data = candles.map(c => ({ time: c.time as UTCTimestamp, value: (cum += c.volume) }));
```

Area series: `lineColor: "#26a69a"`, teal fill. Height: ~160px.

---

## TickerVolumeProfile.tsx (KL khớp theo giá)

SVG horizontal bar chart. Groups 1m candle volume into 20 price buckets.

```typescript
function buildProfile(candles: IntradayCandle[], buckets = 20) {
  const prices = candles.flatMap(c => [c.high, c.low]);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  if (lo === hi) return [];
  const step = (hi - lo) / buckets;
  const vols = new Array(buckets).fill(0);
  for (const c of candles) {
    // VWAP proxy: use midpoint price
    const mid = (c.high + c.low) / 2;
    const idx = Math.min(Math.floor((mid - lo) / step), buckets - 1);
    vols[idx] += c.volume;
  }
  return vols.map((vol, i) => ({
    price: lo + (i + 0.5) * step,
    vol,
    priceLo: lo + i * step,
    priceHi: lo + (i + 1) * step,
  }));
}
```

SVG render: horizontal bars, Y axis = price (high → low, top → bottom), X axis = volume.
- POC (Point of Control) bar highlighted in amber/yellow
- Width: fills container; height: `buckets * 14px`

---

## Layout within TickerDetailPanel

```
┌──────────────────────────────────────────────────────┐
│ DPG · 40.50 (-0.26, -0.5%)  [Dư mua/bán] [KL/phút] │
├─────────────────────┬────────────────────────────────┤
│ Order book (left)   │ Volume profile (right)         │
│ 3-level bid/ask     │ KL khớp theo giá (horizontal)  │
├─────────────────────┴────────────────────────────────┤
│ KL/phút bar chart (full width)                       │
├──────────────────────────────────────────────────────┤
│ Cumulative volume area chart (full width)            │
└──────────────────────────────────────────────────────┘
```

## Success Criteria

- Order book shows 3-level depth for Binance symbols; placeholder for VN
- KL/phút bar chart renders per 1m candle colored by direction
- Cumulative volume area chart smooth, no flash on 30s refresh (two-effect pattern)
- Volume profile shows 20 buckets, POC highlighted, updates on data change
- All 4 components show skeleton (pulsing gray) while data is null
