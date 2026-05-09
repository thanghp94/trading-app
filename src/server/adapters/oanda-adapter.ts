import type { Candle, Timeframe } from '../../shared/types.js';
import { BaseDataAdapter, type BackfillOptions } from './base-data-adapter.js';

const REST_BASE = 'https://api-fxpractice.oanda.com';

const TF_TO_OANDA: Record<Timeframe, string> = {
  '1m': 'M1',
  '5m': 'M5',
  '15m': 'M15',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D',
};

/** REST poll cadence per timeframe — short TFs poll fast, daily polls once a minute. */
const POLL_MS: Record<Timeframe, number> = {
  '1m': 3_000,
  '5m': 5_000,
  '15m': 10_000,
  '1h': 30_000,
  '4h': 60_000,
  '1d': 60_000,
};

interface OandaCandle {
  complete: boolean;
  volume: number;
  time: string; // ISO with nanoseconds, e.g. "2026-05-09T12:35:00.000000000Z"
  mid: { o: string; h: string; l: string; c: string };
}

interface OandaCandlesResponse {
  instrument: string;
  granularity: string;
  candles: OandaCandle[];
}

/**
 * OANDA practice-account adapter — REST polling for OHLC bars.
 *
 * Auth via personal access token on every request. No WebSocket; we poll
 * the candles endpoint at a per-timeframe cadence and emit deltas. This is
 * the simplest path to live OHLC for forex/gold; the BID/ASK pricing
 * stream is more granular but requires server-side bar aggregation.
 *
 * Symbol convention: app uses "XAUUSD", OANDA uses "XAU_USD". Mapped at
 * the boundary so callers stay symbol-agnostic.
 */
export class OandaAdapter extends BaseDataAdapter {
  private timers = new Map<string, NodeJS.Timeout>(); // key=`${symbol}:${tf}`
  private token: string;

  constructor(token: string) {
    super();
    this.token = token;
  }

  private toOandaSymbol(symbol: string): string {
    // XAUUSD → XAU_USD, EURUSD → EUR_USD, USDJPY → USD_JPY, etc.
    const s = symbol.toUpperCase();
    if (s.includes('_')) return s;
    if (s.length === 6) return `${s.slice(0, 3)}_${s.slice(3)}`;
    return s;
  }

  private fromOandaSymbol(instrument: string): string {
    return instrument.replace('_', '');
  }

  async fetchHistorical(opts: BackfillOptions): Promise<Candle[]> {
    const instrument = this.toOandaSymbol(opts.symbol);
    const granularity = TF_TO_OANDA[opts.timeframe];
    const params = new URLSearchParams({
      granularity,
      price: 'M',
      count: String(Math.min(Math.max(opts.limit, 5), 5000)),
    });
    if (opts.sinceSec) {
      params.delete('count');
      params.set('from', new Date(opts.sinceSec * 1000 + 1).toISOString());
    }
    const url = `${REST_BASE}/v3/instruments/${instrument}/candles?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}`, 'Accept-Datetime-Format': 'RFC3339' },
    });
    if (!res.ok) {
      throw new Error(`OANDA REST ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as OandaCandlesResponse;
    const out: Candle[] = json.candles.map((c) => ({
      symbol: this.fromOandaSymbol(json.instrument),
      timeframe: opts.timeframe,
      time: Math.floor(new Date(c.time).getTime() / 1000),
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: c.volume,
      closed: c.complete,
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
          // Fetch the last 2 candles: the most recent closed bar + the open bar.
          const recent = await this.fetchHistorical({ symbol: s.symbol, timeframe: s.timeframe, limit: 2 });
          for (const c of recent) this.emitCandle(c);
        } catch (err) {
          this.emit('error', err as Error);
        }
      };
      // Fire once immediately so the chart updates without waiting a full interval.
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
