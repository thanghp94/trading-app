import { ALL_TRACKED_SYMBOLS, VN30_SYMBOLS, getSector } from "./sector-map.js";
import {
  fetchStockSnapshots,
  fetchCumulativeVolume,
  fetchYesterdayCumulativeVolume,
  computeBreadth,
  type StockSnapshot,
  type MarketBreadth,
  type LiquidityPoint,
} from "./entrade-market-client.js";
import { fetchForeignFlow, type ForeignFlowRow } from "./ssi-foreign-client.js";

export type { StockSnapshot, MarketBreadth, LiquidityPoint, ForeignFlowRow };

export interface MarketCache {
  stocks: StockSnapshot[];
  breadth: MarketBreadth;
  liquidity: { today: LiquidityPoint[]; yesterday: LiquidityPoint[] };
  updatedAt: number;
}

export interface ForeignCache {
  flows: ForeignFlowRow[];
  updatedAt: number;
}

const POLL_MS = 30_000; // 30s — balances freshness vs Entrade load
const FOREIGN_POLL_MS = 60_000; // 60s — SSI board payload is heavy, values move slowly

class MarketDataService {
  private cache: MarketCache | null = null;
  private foreign: ForeignCache | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private foreignTimer: ReturnType<typeof setInterval> | null = null;
  private fetching = false;
  private foreignFetching = false;

  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
    this.pollForeign();
    this.foreignTimer = setInterval(() => this.pollForeign(), FOREIGN_POLL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.foreignTimer) {
      clearInterval(this.foreignTimer);
      this.foreignTimer = null;
    }
  }

  getCache(): MarketCache | null {
    return this.cache;
  }

  getForeign(): ForeignCache | null {
    return this.foreign;
  }

  private async poll(): Promise<void> {
    if (this.fetching) return; // skip if previous poll still running
    this.fetching = true;

    try {
      const [stocksResult, todayLiqResult, yesterdayLiqResult] =
        await Promise.allSettled([
          fetchStockSnapshots(ALL_TRACKED_SYMBOLS, getSector),
          fetchCumulativeVolume(VN30_SYMBOLS),
          fetchYesterdayCumulativeVolume(VN30_SYMBOLS),
        ]);

      const stocks =
        stocksResult.status === "fulfilled"
          ? stocksResult.value
          : (this.cache?.stocks ?? []);

      const today =
        todayLiqResult.status === "fulfilled"
          ? todayLiqResult.value
          : (this.cache?.liquidity.today ?? []);

      const yesterday =
        yesterdayLiqResult.status === "fulfilled"
          ? yesterdayLiqResult.value
          : (this.cache?.liquidity.yesterday ?? []);

      this.cache = {
        stocks,
        breadth: computeBreadth(stocks),
        liquidity: { today, yesterday },
        updatedAt: Date.now(),
      };
    } catch {
      // keep stale cache on total failure
    } finally {
      this.fetching = false;
    }
  }

  private async pollForeign(): Promise<void> {
    if (this.foreignFetching) return;
    this.foreignFetching = true;

    try {
      const flows = await fetchForeignFlow();
      if (flows.length > 0) {
        this.foreign = { flows, updatedAt: Date.now() };
      }
    } catch {
      // keep stale foreign cache on failure
    } finally {
      this.foreignFetching = false;
    }
  }
}

export const marketDataService = new MarketDataService();
