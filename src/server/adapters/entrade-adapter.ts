import { resample } from "../../shared/indicators/resample.js";
import type { Candle, Timeframe } from "../../shared/types.js";
import { BaseDataAdapter, type BackfillOptions } from "./base-data-adapter.js";

// Entrade is DNSE's public TradingView-UDF chart backend. No auth, no key.
// Same OHLC shape DNSE LightSpeed serves; covers VN equities + VN30 futures.
const BASE_URL = "https://services.entrade.com.vn/chart-api/v2/ohlcs";

/**
 * Returns true if the current wall-clock time falls within VN market trading hours.
 * HOSE/HNX: 09:00-11:30 and 13:00-15:00 ICT (UTC+7) = 02:00-04:30 and 06:00-08:00 UTC.
 * A 10-minute buffer is added after session end to capture the final bar emit.
 */
function isVnMarketOpen(): boolean {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  const totalMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  // Morning session: 02:00–04:40 UTC (09:00–11:40 ICT with 10-min buffer)
  // Afternoon session: 06:00–08:10 UTC (13:00–15:10 ICT with 10-min buffer)
  return (
    (totalMin >= 120 && totalMin < 280) || (totalMin >= 360 && totalMin < 490)
  );
}

// Entrade resolution strings. 4h not supported — fetch 1h and resample.
const TF_TO_RES: Record<Timeframe, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "1H",
  "4h": "1H",
  "1d": "1D",
};

// Empirical history limits: intraday (1m–1h) ~60 days; daily ~10y.
const RANGE_SEC: Record<Timeframe, number> = {
  "1m": 60 * 86400,
  "5m": 60 * 86400,
  "15m": 60 * 86400,
  "1h": 60 * 86400,
  "4h": 60 * 86400,
  "1d": 10 * 365 * 86400,
};

const POLL_MS: Record<Timeframe, number> = {
  "1m": 30_000,
  "5m": 30_000,
  "15m": 60_000,
  "1h": 120_000,
  "4h": 300_000,
  "1d": 600_000,
};

interface EntradeOhlcResponse {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  nextTime?: number;
  code?: string;
  message?: string;
}

// VN30 index futures (VN30F1M, VN30F2M, ...) are derivatives; everything else
// routed here is a cash equity.
function symbolType(symbol: string): "derivative" | "stock" {
  return /^VN30F/i.test(symbol) ? "derivative" : "stock";
}

/**
 * Keyless Entrade adapter for VN equities (HOSE/HNX/UPCOM) and VN30 futures.
 *
 * Replaces the Yahoo `.VN` adapter as the VN-equity default — Yahoo's chart
 * API now hard 429s. Entrade is DNSE's own data CDN: free, no signup, no key.
 *
 * Prices: equities quoted in thousands VND (24.15 = 24,150đ) — scaled x1000 so
 * all adapters emit full-VND prices. Futures are index points, no scaling.
 *
 * Live updates via REST polling (Entrade returns the still-forming session
 * bar inline, so the live candle updates as we poll).
 */
export class EntradeAdapter extends BaseDataAdapter {
  private timers = new Map<string, NodeJS.Timeout>();

  private async fetchOhlc(
    symbol: string,
    timeframe: Timeframe,
    fromSec: number,
    toSec: number,
  ): Promise<Candle[]> {
    const kind = symbolType(symbol);
    const resolution = TF_TO_RES[timeframe === "4h" ? "1h" : timeframe];
    const params = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      resolution,
      from: String(fromSec),
      to: String(toSec),
    });
    const url = `${BASE_URL}/${kind}?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(
        `Entrade HTTP ${res.status} for ${symbol}: ${await res.text().then((t) => t.slice(0, 200))}`,
      );
    }
    const json = (await res.json()) as EntradeOhlcResponse;
    if (json.code || json.message) {
      throw new Error(
        `Entrade error for ${symbol}: ${json.message ?? json.code}`,
      );
    }
    if (!json.t?.length) return [];

    // Equities priced in thousands VND; futures in index points (no scaling).
    const priceScale = kind === "stock" ? 1000 : 1;

    const candles: Candle[] = [];
    for (let i = 0; i < json.t.length; i++) {
      const o = json.o[i];
      const h = json.h[i];
      const l = json.l[i];
      const c = json.c[i];
      const v = json.v[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({
        symbol: symbol.toUpperCase(),
        timeframe,
        time: json.t[i],
        open: o * priceScale,
        high: h * priceScale,
        low: l * priceScale,
        close: c * priceScale,
        volume: v ?? 0,
        closed: true,
      });
    }
    return candles.filter((c) => this.isValid(c));
  }

  async fetchHistorical(opts: BackfillOptions): Promise<Candle[]> {
    const toSec = Math.floor(Date.now() / 1000);
    const fromSec = opts.sinceSec ?? toSec - RANGE_SEC[opts.timeframe];
    const raw = await this.fetchOhlc(
      opts.symbol,
      opts.timeframe,
      fromSec,
      toSec,
    );

    let candles =
      opts.timeframe === "4h"
        ? resample(
            raw.map((c) => ({ ...c, timeframe: "1h" as Timeframe })),
            "4h",
          )
        : raw;

    if (candles.length > opts.limit) {
      candles = candles.slice(-opts.limit);
    }
    return candles;
  }

  async openLive(
    streams: Array<{ symbol: string; timeframe: Timeframe }>,
  ): Promise<void> {
    for (const s of streams) {
      const key = `${s.symbol.toUpperCase()}:${s.timeframe}`;
      if (this.timers.has(key)) continue;
      const interval = POLL_MS[s.timeframe];
      const tick = async () => {
        // Skip polling outside VN market hours — prevents re-evaluating stale
        // closed bars after session end, which causes duplicate Telegram alerts.
        if (!isVnMarketOpen()) return;
        try {
          const toSec = Math.floor(Date.now() / 1000);
          const fromSec =
            toSec - RANGE_SEC[s.timeframe === "4h" ? "1h" : s.timeframe] / 10;
          const recent = await this.fetchOhlc(
            s.symbol,
            s.timeframe,
            fromSec,
            toSec,
          );
          const candles =
            s.timeframe === "4h"
              ? resample(
                  recent.map((c) => ({ ...c, timeframe: "1h" as Timeframe })),
                  "4h",
                )
              : recent;
          for (const c of candles) this.emitCandle(c);
        } catch (err) {
          this.emit("error", err as Error);
        }
      };
      void tick();
      this.timers.set(key, setInterval(tick, interval));
    }
    this.setState("live");
  }

  async close(): Promise<void> {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
    this.setState("closed");
  }
}
