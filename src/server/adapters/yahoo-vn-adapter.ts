import type { Candle, Timeframe } from '../../shared/types.js';
import { resample } from '../../shared/indicators/resample.js';
import { BaseDataAdapter, type BackfillOptions } from './base-data-adapter.js';

const REST_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
// Yahoo requires a browser-ish User-Agent header — they 401 plain curl/fetch
// without one. Any real UA works.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Yahoo Finance supported intervals. 4h is NOT supported — we fetch 1h
 * and resample server-side using our existing `resample()` utility.
 */
const TF_TO_YAHOO: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '60m',
  '4h': '60m', // resampled to 4h after fetch
  '1d': '1d',
};

/** Yahoo's max range per interval. Used for cold-start backfill. */
const RANGE_FOR: Record<Timeframe, string> = {
  '1m': '7d',
  '5m': '60d',
  '15m': '60d',
  '1h': '730d',
  '4h': '730d', // fetched as 1h then resampled
  '1d': '10y',
};

const POLL_MS: Record<Timeframe, number> = {
  '1m': 30_000,
  '5m': 30_000,
  '15m': 60_000,
  '1h': 120_000,
  '4h': 300_000,
  '1d': 600_000,
};

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        symbol: string;
        currency: string;
        exchangeName: string;
        gmtoffset: number;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open: Array<number | null>;
          high: Array<number | null>;
          low: Array<number | null>;
          close: Array<number | null>;
          volume: Array<number | null>;
        }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

/**
 * Yahoo Finance adapter for Vietnamese equities (HOSE / HNX / UPCOM).
 *
 * Free, no signup, no auth. Yahoo covers VN stocks under the `.VN` suffix:
 *   HPG → HPG.VN
 *   VCB → VCB.VN
 *   FPT → FPT.VN
 *
 * Coverage:
 *   ✅ Stocks (delayed 15 min for free quotes, EOD reliable)
 *   ❌ VN30 futures (VN30F1M etc) — not on Yahoo. Use DNSE for those.
 *
 * Replaces the previous TCBS adapter — TCBS deprecated their public
 * apipubaws.tcbs.com.vn/stock-insight paths and now returns 404. Yahoo
 * is more reliable for charting purposes.
 *
 * Live updates via REST polling — 30s for short TFs, slower for higher.
 * Yahoo returns the still-forming session candle inline, so the live bar
 * updates naturally as we poll.
 */
export class YahooVnAdapter extends BaseDataAdapter {
  private timers = new Map<string, NodeJS.Timeout>();

  private toYahooSymbol(symbol: string): string {
    const s = symbol.toUpperCase();
    if (s.includes('.')) return s;
    return `${s}.VN`;
  }

  private fromYahooSymbol(ys: string): string {
    return ys.replace(/\.VN$/, '');
  }

  async fetchHistorical(opts: BackfillOptions): Promise<Candle[]> {
    const ysym = this.toYahooSymbol(opts.symbol);
    const yInterval = TF_TO_YAHOO[opts.timeframe];
    const range = RANGE_FOR[opts.timeframe];
    const params = new URLSearchParams({
      interval: yInterval,
      range,
      includePrePost: 'false',
    });
    const url = `${REST_BASE}/${encodeURIComponent(ysym)}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Yahoo REST ${res.status} for ${ysym}: ${await res.text().then((t) => t.slice(0, 200))}`);
    }
    const json = (await res.json()) as YahooChartResponse;
    if (json.chart.error) {
      throw new Error(`Yahoo error: ${json.chart.error.description ?? json.chart.error.code}`);
    }
    const result = json.chart.result?.[0];
    if (!result?.timestamp || !result.indicators?.quote?.[0]) return [];

    const q = result.indicators.quote[0];
    const ts = result.timestamp;
    const candles: Candle[] = [];
    for (let i = 0; i < ts.length; i += 1) {
      const o = q.open[i];
      const h = q.high[i];
      const l = q.low[i];
      const c = q.close[i];
      const v = q.volume[i];
      // Skip null entries — Yahoo pads with nulls for non-trading periods.
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({
        symbol: this.fromYahooSymbol(result.meta.symbol),
        timeframe: opts.timeframe,
        time: ts[i],
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v ?? 0,
        closed: true,
      });
    }
    const filtered = candles.filter((c) => this.isValid(c));

    // 4h: Yahoo doesn't expose it natively, so we resample from 1h.
    if (opts.timeframe === '4h') {
      const oneHour = filtered.map((c) => ({ ...c, timeframe: '1h' as Timeframe }));
      return resample(oneHour, '4h');
    }

    // Apply countBack-style trimming if requested.
    if (filtered.length > opts.limit) {
      return filtered.slice(-opts.limit);
    }
    return filtered;
  }

  async openLive(streams: Array<{ symbol: string; timeframe: Timeframe }>): Promise<void> {
    for (const s of streams) {
      const key = `${s.symbol.toUpperCase()}:${s.timeframe}`;
      if (this.timers.has(key)) continue;
      const interval = POLL_MS[s.timeframe];
      const tick = async () => {
        try {
          const recent = await this.fetchHistorical({ symbol: s.symbol, timeframe: s.timeframe, limit: 3 });
          for (const c of recent) this.emitCandle(c);
        } catch (err) {
          this.emit('error', err as Error);
        }
      };
      void tick();
      this.timers.set(key, setInterval(tick, interval));
    }
    this.setState('live');
  }

  async close(): Promise<void> {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
    this.setState('closed');
  }
}
