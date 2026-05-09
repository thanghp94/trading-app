import type { Candle, Timeframe } from '../../shared/types.js';
import { BaseDataAdapter, type BackfillOptions } from './base-data-adapter.js';

const REST_BASE = 'https://api.twelvedata.com';

const TF_TO_TD: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
};

/**
 * REST poll cadence per timeframe (ms). TwelveData free tier = 800 req/day.
 *   800 / 86400 ≈ 1 req every 108s — so 110s is the minimum safe interval
 *   for a SINGLE active stream. With multiple symbols/timeframes the budget
 *   is shared; we throttle conservatively per stream and emit a warning if
 *   we see a 429 from the API.
 */
const POLL_MS: Record<Timeframe, number> = {
  '1m': 120_000,
  '5m': 120_000,
  '15m': 180_000,
  '1h': 600_000,
  '4h': 1_800_000,
  '1d': 7_200_000,
};

interface TdValue {
  datetime: string; // "2026-05-09 12:35:00" UTC
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

interface TdSuccessResponse {
  meta: { symbol: string; interval: string; type?: string };
  values: TdValue[];
  status: 'ok';
}

interface TdErrorResponse {
  status: 'error';
  code?: number;
  message?: string;
}

type TdResponse = TdSuccessResponse | TdErrorResponse;

/**
 * TwelveData adapter for spot XAU/USD + forex pairs (works in VN where
 * OANDA is blocked).
 *
 * Symbol convention: app uses "XAUUSD" / "EURUSD"; TwelveData wants
 * "XAU/USD" / "EUR/USD". Mapped at the boundary.
 *
 * Live updates via REST polling (no streaming on free tier). Last bar is
 * always treated as "open" — its OHLC may revise on each poll until the
 * bar closes; once a new bar appears, the prior bar is finalized.
 */
export class TwelveDataAdapter extends BaseDataAdapter {
  private timers = new Map<string, NodeJS.Timeout>(); // key=`${symbol}:${tf}`
  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  private toTdSymbol(symbol: string): string {
    const s = symbol.toUpperCase();
    if (s.includes('/')) return s;
    if (s.length === 6) return `${s.slice(0, 3)}/${s.slice(3)}`;
    return s;
  }

  private fromTdSymbol(td: string): string {
    return td.replace('/', '');
  }

  async fetchHistorical(opts: BackfillOptions): Promise<Candle[]> {
    const symbol = this.toTdSymbol(opts.symbol);
    const interval = TF_TO_TD[opts.timeframe];
    const params = new URLSearchParams({
      symbol,
      interval,
      apikey: this.apiKey,
      outputsize: String(Math.min(Math.max(opts.limit, 5), 5000)),
      order: 'ASC',
      timezone: 'UTC',
    });
    if (opts.sinceSec) {
      params.set('start_date', new Date(opts.sinceSec * 1000 + 1).toISOString().slice(0, 19));
    }
    const url = `${REST_BASE}/time_series?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`TwelveData REST ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as TdResponse;
    if (json.status === 'error') {
      throw new Error(`TwelveData error ${json.code ?? ''}: ${json.message ?? 'unknown'}`);
    }

    const totalValues = json.values.length;
    const out: Candle[] = json.values.map((v, idx) => ({
      symbol: this.fromTdSymbol(json.meta.symbol),
      timeframe: opts.timeframe,
      // Datetimes from TwelveData are UTC bar-open times; parse as such.
      time: Math.floor(Date.parse(`${v.datetime.replace(' ', 'T')}Z`) / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume ? parseFloat(v.volume) : 0,
      // Last bar (highest index in ASC order) is the still-forming bar.
      closed: idx < totalValues - 1,
    }));
    return out.filter((c) => this.isValid(c));
  }

  async openLive(streams: Array<{ symbol: string; timeframe: Timeframe }>): Promise<void> {
    for (const s of streams) {
      const key = `${s.symbol.toUpperCase()}:${s.timeframe}`;
      if (this.timers.has(key)) continue;
      const interval = POLL_MS[s.timeframe];
      const tick = async () => {
        try {
          const recent = await this.fetchHistorical({ symbol: s.symbol, timeframe: s.timeframe, limit: 2 });
          for (const c of recent) this.emitCandle(c);
        } catch (err) {
          // Surface 429 / quota exhaustion clearly so the user knows why updates stopped.
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
