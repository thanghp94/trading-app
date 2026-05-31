# Phase 01: Market Data Service

**Priority:** High | **Status:** Todo | **Effort:** Medium

## Overview

Server-side polling service that fetches VN market data from SSI iBoard (or DNSE fallback),
caches in memory with 15s TTL, and exposes typed data for API routes.

## Files to Create

- `src/server/market/market-data-service.ts` — main service, polling loop, cache
- `src/server/market/ssi-client.ts` — SSI iBoard HTTP client
- `src/server/market/sector-map.ts` — static stock→sector JSON mapping

## API Research (SSI iBoard — no auth required)

```
# All stocks snapshot (HSX + HNX + UPCOM)
GET https://iboard.ssi.com.vn/dchart/api/1.1/defaultAllStocks
# Response: array of { sym, r (ref), c (close/last), changePc, vol, val, buy_for, sell_for, ... }

# Market breadth (advance/decline/unchanged)
GET https://iboard.ssi.com.vn/dchart/api/1.1/defaultGetMarketBreadth?market=HOSE

# Foreign flow
GET https://iboard.ssi.com.vn/dchart/api/1.1/defaultGetForeignStats?market=HOSE
# Response: { buyVol, sellVol, buyVal, sellVal, netVal, ... } per sector

# Intraday index chart (for liquidity baseline)
GET https://iboard.ssi.com.vn/dchart/api/1.1/defaultGetIndexOHLC?indexId=VNINDEX&resolution=1
```

**Verify these endpoints at implementation time** — SSI sometimes changes paths.
If blocked, fallback: aggregate from Entrade 1m candles for VN30 symbols.

## sector-map.ts

Static mapping, ~500 major VN stocks:

```typescript
export const SECTOR_MAP: Record<string, string> = {
  // Tài chính (Finance)
  VCB: "Tài chính", BID: "Tài chính", CTG: "Tài chính", TCB: "Tài chính",
  MBB: "Tài chính", VPB: "Tài chính", ACB: "Tài chính", STB: "Tài chính",
  // Bất động sản (Real Estate)
  VHM: "Bất động sản", VIC: "Bất động sản", NVL: "Bất động sản",
  PDR: "Bất động sản", DXG: "Bất động sản",
  // Vật liệu (Materials)
  HPG: "Vật liệu", HSG: "Vật liệu", NKG: "Vật liệu",
  // ... expand to ~500 symbols
  // Unknown → "Khác"
};
export function getSector(symbol: string): string {
  return SECTOR_MAP[symbol] ?? "Khác";
}
```

## market-data-service.ts

```typescript
export interface StockSnapshot {
  symbol: string;
  sector: string;
  pctChange: number;    // e.g. -2.34
  value: number;        // trading value (VND) — used for treemap sizing
  price: number;
  refPrice: number;
}

export interface MarketBreadth {
  advance: number;
  decline: number;
  unchanged: number;
}

export interface ForeignFlow {
  sector: string;
  buyVal: number;       // VND billion
  sellVal: number;
  netVal: number;
}

export interface LiquidityPoint {
  time: number;         // unix seconds (minute bucket)
  cumVol: number;       // cumulative volume
}

export interface MarketCache {
  stocks: StockSnapshot[];
  breadth: MarketBreadth;
  foreign: ForeignFlow[];
  liquidity: { today: LiquidityPoint[]; yesterday: LiquidityPoint[] };
  updatedAt: number;
}

export class MarketDataService {
  private cache: MarketCache | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly TTL_MS = 15_000;

  start(): void {
    this.fetch();
    this.timer = setInterval(() => this.fetch(), this.TTL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getCache(): MarketCache | null { return this.cache; }

  private async fetch(): Promise<void> {
    try {
      const [stocks, breadth, foreign, liquidity] = await Promise.allSettled([
        fetchStocks(),
        fetchBreadth(),
        fetchForeign(),
        fetchLiquidity(),
      ]);
      // merge fulfilled results, keep stale for rejected
      // ...
    } catch {/* log, keep stale cache */}
  }
}
```

## ssi-client.ts

```typescript
const BASE = "https://iboard.ssi.com.vn/dchart/api/1.1";
const HEADERS = { "Accept": "application/json", "Referer": "https://iboard.ssi.com.vn" };

export async function fetchStocks(): Promise<StockSnapshot[]> { ... }
export async function fetchBreadth(): Promise<MarketBreadth> { ... }
export async function fetchForeign(): Promise<ForeignFlow[]> { ... }
export async function fetchLiquidity(): Promise<LiquidityData> { ... }
```

## Implementation Steps

1. Create `src/server/market/` directory
2. Build `sector-map.ts` with ~100 major HOSE stocks minimum (expand later)
3. Build `ssi-client.ts` — test each endpoint with `curl -H "Referer: https://iboard.ssi.com.vn"` first
4. Build `market-data-service.ts` — `Promise.allSettled` so partial failures return stale data
5. Export singleton `marketDataService` from `market-data-service.ts`
6. Start service in `src/server/index.ts` on server boot

## Error Handling

- SSI endpoint 403/rate-limit → keep previous cache, log warn
- First boot (no cache) → return `null` → frontend shows skeleton
- Partial failure (e.g. foreign fails) → return rest, set `foreign: []`

## Success Criteria

- `marketDataService.getCache()` returns data within 5s of server start
- Polling every 15s without memory leak (single interval, cleared on stop)
- Handles SSI endpoint being down gracefully (stale cache served)
