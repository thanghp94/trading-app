# Market Overview Panel

**Status:** Planning
**Created:** 2026-05-28
**Slug:** 260528-1656-market-overview-panel

## Goal

Add a "Market" dock panel with 3 tabs replicating FireAnt's market overview:
- **Biến động** — sector treemap heatmap + advance/decline pie + money flow bars
- **Thanh khoản** — cumulative intraday volume (today vs yesterday area chart)
- **Khối ngoại** — foreign investor buy/sell flow bars + net table

## Data Sources

| Tab | Source | Endpoint | Auth | Latency |
|---|---|---|---|---|
| Biến động (treemap) | SSI iBoard | `iboard.ssi.com.vn/dchart/api/1.1/` | None (cookie-less) | ~10-15s poll |
| Thanh khoản | Entrade (existing) | 1m OHLC for VN30 components | None | 30s poll |
| Khối ngoại | SSI iBoard | `fl-market` or DNSE equiv | None (try) | ~30s poll |

**Fallback:** If SSI endpoints require auth, VN30 component symbols via existing Entrade adapter.

## Architecture

```
Server:
  src/server/market/
    market-data-service.ts   ← polling + in-memory cache (15s TTL)
    ssi-client.ts            ← SSI iBoard API client
    sector-map.ts            ← static VN stock→sector mapping (~500 stocks)

  src/server/index.ts        ← 3 new GET routes

Frontend:
  src/web/components/
    MarketOverviewPanel.tsx  ← shell with 3 tabs (< 200 lines, imports sub-views)
    MarketTreemap.tsx        ← d3-hierarchy squarified treemap + pie
    MarketLiquidity.tsx      ← lightweight-charts area series (today vs yesterday)
    MarketForeign.tsx        ← horizontal bar chart + net table

  src/web/use-dock.ts        ← add "market" to PanelId
  src/web/components/DockBar.tsx ← add button
  src/web/App.tsx            ← render MarketOverviewPanel
```

## Phases

| # | Phase | Files | Effort |
|---|---|---|---|
| 01 | [Market Data Service](phase-01-market-data-service.md) | 3 new server files | M |
| 02 | [API Routes](phase-02-api-routes.md) | server/index.ts | S |
| 03 | [Frontend Panel](phase-03-frontend-panel.md) | 4 new components | L |
| 04 | [Dock Integration](phase-04-dock-integration.md) | 3 existing files | S |

## Dependencies

- `d3-hierarchy` — treemap layout (new, small ~15KB)
- All else: existing stack (lightweight-charts, React, Fastify)

## Constraints

- Foreign flow (khối ngoại) real-time is not guaranteed — SSI endpoint may require session. Accept ~5min delayed data from public endpoint or show N/A gracefully.
- Sector map is static JSON — covers HOSE/HNX major stocks, others grouped as "Khác".
- No server-side DB — all cached in-memory, resets on restart (acceptable for market overview).
