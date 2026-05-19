import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { resample } from '../../shared/indicators/resample.js';
import type { Candle, Timeframe } from '../../shared/types.js';
import { BaseDataAdapter, type BackfillOptions } from './base-data-adapter.js';

const BASE_URL = 'https://openapi.dnse.com.vn';

// DNSE resolution strings. 4h not supported — fetch 1h and resample.
const TF_TO_DNSE: Record<Timeframe, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '1H',
  '4h': '1H',
  '1d': '1D',
};

// DNSE actual history limits (empirically verified):
//   intraday (1m–1h): ~60 days
//   daily: stocks ~10y, futures ~8y (VN30F launched Aug 2018)
const RANGE_SEC: Record<Timeframe, number> = {
  '1m': 60 * 86400,
  '5m': 60 * 86400,
  '15m': 60 * 86400,
  '1h': 60 * 86400,
  '4h': 60 * 86400,
  '1d': 10 * 365 * 86400,
};

const POLL_MS: Record<Timeframe, number> = {
  '1m': 30_000,
  '5m': 30_000,
  '15m': 60_000,
  '1h': 120_000,
  '4h': 300_000,
  '1d': 600_000,
};

interface DnseOhlcResponse {
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

// VN30 index futures — derivatives, not equities
function symbolType(symbol: string): 'DERIVATIVE' | 'STOCK' {
  return /^VN30F/i.test(symbol) ? 'DERIVATIVE' : 'STOCK';
}

/**
 * DNSE LightSpeed adapter for VN30 futures and VN equities.
 *
 * Auth: HTTP Signatures — HMAC-SHA256 over:
 *   "(request-target): {method} {path}\ndate: {date}\nnonce: {nonce}"
 * Headers: x-api-key, X-Signature (Signature keyId=... format), Date
 *
 * Prices returned in VND for stocks (same scale as Yahoo), index points for
 * futures (VN30F1M etc). No unit conversion needed.
 */
export class DnseAdapter extends BaseDataAdapter {
  private timers = new Map<string, NodeJS.Timeout>();
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    super();
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private signHeaders(method: string, path: string): Record<string, string> {
    const date = new Date().toUTCString();
    const nonce = randomUUID().replace(/-/g, '');
    const sigString = `(request-target): ${method.toLowerCase()} ${path}\ndate: ${date}\nnonce: ${nonce}`;
    const mac = createHmac('sha256', this.apiSecret).update(sigString).digest('base64');
    const encodedSig = encodeURIComponent(mac);
    const xSig =
      `Signature keyId="${this.apiKey}",algorithm="hmac-sha256",` +
      `headers="(request-target) date",signature="${encodedSig}",nonce="${nonce}"`;
    return { 'x-api-key': this.apiKey, 'X-Signature': xSig, Date: date };
  }

  private async fetchOhlc(
    symbol: string,
    timeframe: Timeframe,
    fromSec: number,
    toSec: number,
  ): Promise<Candle[]> {
    const resolution = TF_TO_DNSE[timeframe === '4h' ? '1h' : timeframe];
    const type = symbolType(symbol);
    const params = new URLSearchParams({
      type,
      symbol: symbol.toUpperCase(),
      resolution,
      from: String(fromSec),
      to: String(toSec),
    });
    const path = `/price/ohlc?${params.toString()}`;
    const headers = this.signHeaders('GET', '/price/ohlc');
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    if (!res.ok) {
      throw new Error(`DNSE HTTP ${res.status} for ${symbol}: ${await res.text().then((t) => t.slice(0, 200))}`);
    }
    const json = (await res.json()) as DnseOhlcResponse;
    if (json.code || json.message) {
      throw new Error(`DNSE error for ${symbol}: ${json.message ?? json.code}`);
    }
    if (!json.t?.length) return [];

    // DNSE quotes VN equities in thousands VND (nghìn đồng); futures in index
    // points. Multiply stocks by 1000 so all adapters emit full-VND prices.
    const priceScale = symbolType(symbol) === 'STOCK' ? 1000 : 1;

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
    const raw = await this.fetchOhlc(opts.symbol, opts.timeframe, fromSec, toSec);

    let candles = opts.timeframe === '4h'
      ? resample(raw.map((c) => ({ ...c, timeframe: '1h' as Timeframe })), '4h')
      : raw;

    if (candles.length > opts.limit) {
      candles = candles.slice(-opts.limit);
    }
    return candles;
  }

  async openLive(streams: Array<{ symbol: string; timeframe: Timeframe }>): Promise<void> {
    for (const s of streams) {
      const key = `${s.symbol.toUpperCase()}:${s.timeframe}`;
      if (this.timers.has(key)) continue;
      const interval = POLL_MS[s.timeframe];
      const tick = async () => {
        try {
          const toSec = Math.floor(Date.now() / 1000);
          const fromSec = toSec - RANGE_SEC[s.timeframe === '4h' ? '1h' : s.timeframe] / 10;
          const recent = await this.fetchOhlc(s.symbol, s.timeframe, fromSec, toSec);
          const candles = s.timeframe === '4h'
            ? resample(recent.map((c) => ({ ...c, timeframe: '1h' as Timeframe })), '4h')
            : recent;
          for (const c of candles) this.emitCandle(c);
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
