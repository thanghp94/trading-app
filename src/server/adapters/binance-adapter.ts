import WebSocket from 'ws';
import type { Candle, Timeframe } from '../../shared/types.js';
import { BaseDataAdapter, type BackfillOptions } from './base-data-adapter.js';

const REST_BASE = 'https://api.binance.com';
const WS_BASE = 'wss://stream.binance.com:9443/stream';

const TF_TO_BINANCE: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

interface BinanceKlineRest {
  // [openTime, open, high, low, close, volume, closeTime, ...]
  0: number;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: number;
}

interface BinanceKlineWs {
  k: {
    t: number; // open time ms
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean; // is closed
    s: string; // symbol
    i: string; // interval
  };
}

/**
 * Binance public-data adapter — no auth required for kline data.
 * Uses combined WS streams for multi-symbol multiplexing.
 */
export class BinanceAdapter extends BaseDataAdapter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subs = new Set<string>(); // `${symbolLower}@kline_${interval}`

  async fetchHistorical(opts: BackfillOptions): Promise<Candle[]> {
    const interval = TF_TO_BINANCE[opts.timeframe];
    const params = new URLSearchParams({
      symbol: opts.symbol.toUpperCase(),
      interval,
      limit: String(Math.min(opts.limit, 1000)),
    });
    if (opts.sinceSec) {
      params.set('startTime', String(opts.sinceSec * 1000 + 1));
    }
    const url = `${REST_BASE}/api/v3/klines?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Binance REST ${res.status}: ${await res.text()}`);
    }
    const rows = (await res.json()) as BinanceKlineRest[];
    const candles: Candle[] = rows.map((r) => ({
      symbol: opts.symbol.toUpperCase(),
      timeframe: opts.timeframe,
      time: Math.floor(r[0] / 1000),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
      closed: true,
    }));
    return candles.filter((c) => this.isValid(c));
  }

  async openLive(streams: Array<{ symbol: string; timeframe: Timeframe }>): Promise<void> {
    for (const s of streams) {
      const key = `${s.symbol.toLowerCase()}@kline_${TF_TO_BINANCE[s.timeframe]}`;
      this.subs.add(key);
    }
    this.connect();
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.setState('closed');
  }

  // Hand-rolled reconnect with exponential backoff + jitter. We could pull
  // in `reconnecting-websocket` later — kept inline here so the binance
  // adapter has zero extra deps and the gap-fill hook is right next to it.
  private reconnectAttempts = 0;
  private connect(): void {
    if (this.subs.size === 0) return;
    const streams = Array.from(this.subs).join('/');
    const url = `${WS_BASE}?streams=${streams}`;
    this.setState(this.ws ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.setState('live');
      void this.gapFill();
    });

    ws.on('message', (raw) => {
      try {
        const env = JSON.parse(String(raw)) as { stream: string; data: BinanceKlineWs };
        const k = env.data?.k;
        if (!k) return;
        const tf = (Object.entries(TF_TO_BINANCE).find(([, v]) => v === k.i)?.[0] ?? null) as Timeframe | null;
        if (!tf) return;
        const candle: Candle = {
          symbol: k.s,
          timeframe: tf,
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
          closed: k.x,
        };
        this.emitCandle(candle);
      } catch (err) {
        this.emit('error', err as Error);
      }
    });

    ws.on('close', () => {
      if (this.reconnectTimer) return;
      const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempts) + Math.random() * 250;
      this.reconnectAttempts += 1;
      this.setState('reconnecting');
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    });

    ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  /** On reconnect, REST-fetch any bars we may have missed during downtime. */
  private async gapFill(): Promise<void> {
    if (this.lastCandleTs.size === 0) return;
    this.setState('gap-filling');
    for (const [key, sinceSec] of this.lastCandleTs.entries()) {
      const [symbol, timeframe] = key.split(':') as [string, Timeframe];
      try {
        const candles = await this.fetchHistorical({ symbol, timeframe, limit: 200, sinceSec });
        for (const c of candles) this.emitCandle(c);
      } catch (err) {
        this.emit('error', err as Error);
      }
    }
    this.setState('live');
  }
}
