# Ticker Detail Panel

**Status:** Planning
**Created:** 2026-05-28
**Slug:** 260528-1836-ticker-detail-panel

## Goal

Per-symbol ticker detail panel inspired by TCBS UI. Shows:
1. **Order book table** (Dư mua/Dư bán) — 3-level bid/ask with volume
2. **Bid/ask area chart** — accumulated depth over time
3. **KL/phút** — volume per minute bar chart
4. **Khối lượng tích lũy** — cumulative intraday volume area chart
5. **KL khớp theo giá** — volume profile (horizontal histogram by price bucket)

Opens from a "📊" button on any ChartCell toolbar. Active symbol drives the panel.

## Data Reality

| Widget | Source | Status |
|---|---|---|
| Order book (3-level) | Binance: existing WS depth ✓; VN: no public API → N/A placeholder | Partial |
| Bid/ask area chart | Same depth stream, accumulate server-side | Partial |
| KL/phút | Entrade 1m OHLC, already fetched | ✓ Full |
| Cumulative volume | Entrade 1m OHLC, accumulate | ✓ Full |
| Volume profile | Entrade 1m OHLC, group by price bucket | ✓ Full |

## Architecture

```
Server:
  src/server/index.ts
    GET /api/ticker/:symbol/intraday   ← 1m OHLC for today (Entrade)
    GET /api/ticker/:symbol/depth      ← DepthSnapshot (Binance WS) or 404 for VN

Frontend:
  src/web/components/
    TickerDetailPanel.tsx   ← drawer shell, fetches data, passes to sub-views
    TickerOrderBook.tsx     ← 3-level bid/ask table + time-series area chart
    TickerVolumePerMin.tsx  ← lightweight-charts Histogram series (KL/phút)
    TickerCumVolume.tsx     ← lightweight-charts Area series (reuses Liquidity pattern)
    TickerVolumeProfile.tsx ← SVG horizontal bar histogram (KL khớp theo giá)

  src/web/components/ChartCell.tsx   ← add "📊 Detail" button to toolbar
  src/web/use-dock.ts                ← add "ticker" PanelId
  src/web/components/DockBar.tsx     ← no dock button (opens from ChartCell only)
  src/web/App.tsx                    ← render TickerDetailPanel with active symbol
```

## Phases

| # | Phase | Files | Effort |
|---|---|---|---|
| 01 | [Server intraday route](phase-01-server-intraday-route.md) | index.ts | S |
| 02 | [Ticker sub-views](phase-02-ticker-subviews.md) | 4 new components | L |
| 03 | [Panel shell + wiring](phase-03-panel-shell-wiring.md) | TickerDetailPanel + ChartCell + App | M |

## Key Decisions

- **No new dock button** — opens only from ChartCell toolbar → cleaner dock
- **State lift**: `tickerSymbol: string | null` in App.tsx, set by ChartCell callback `onTickerDetail`
- **Intraday route**: fetches Entrade 1m for today's session (02:00–08:00 UTC), cached 30s in-memory per symbol (reuse `marketDataService` pattern)
- **Volume profile**: 20 price buckets between session low–high, filled by summing 1m volume where candle VWAP falls in bucket
- **Depth for VN**: show "Dữ liệu không khả dụng" placeholder — no public VN depth API found
