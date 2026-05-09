import type { Candle, Timeframe } from '../../shared/types.js';
import { BaseDataAdapter, type BackfillOptions } from './base-data-adapter.js';

const REST_BASE = 'https://apipubaws.tcbs.com.vn';

const TF_TO_TCBS: Record<Timeframe, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

/** Poll cadence per timeframe (ms). VN exchanges have 1-min regulatory delay
 *  for free retail data — no point polling faster than the bar resolution. */
const POLL_MS: Record<Timeframe, number> = {
  '1m': 30_000,
  '5m': 30_000,
  '15m': 60_000,
  '1h': 120_000,
  '4h': 300_000,
  '1d': 600_000,
};

interface TcbsBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** ISO date string. */
  tradingDate: string;
}

interface TcbsResponse {
  data: TcbsBar[];
  status: string;
}

/**
 * TCBS public REST adapter — Vietnamese stocks (HOSE/HNX/UPCOM).
 *
 * Free, no auth, no signup. Uses the same public endpoint that the vnstock
 * Python lib uses. Real-time-ish (~1 minute regulatory delay for free
 * retail data, same delay TCBS displays in their own widget).
 *
 * Symbol convention: standard Vietnamese tickers (HPG, VCB, FPT, MWG,
 * VHM, etc.). For VN30 futures use `VN30F1M`.
 *
 * Limitation: TCBS can rate-limit aggressive polling. We poll once per
 * 30s for short timeframes which is well under any documented limit.
 */
export class TcbsAdapter extends BaseDataAdapter {
  private timers = new Map<string, NodeJS.Timeout>();

  async fetchHistorical(opts: BackfillOptions): Promise<Candle[]> {
    const resolution = TF_TO_TCBS[opts.timeframe];
    const to = Math.floor(Date.now() / 1000);
    const limit = Math.min(opts.limit, 5000);
    const params = new URLSearchParams({
      ticker: opts.symbol.toUpperCase(),
      type: 'stock',
      resolution,
      to: String(to),
      countBack: String(limit),
    });
    const url = `${REST_BASE}/stock-insight/v2/stock/bars-long-term?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`TCBS REST ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as TcbsResponse;
    if (!json.data) return [];
    return json.data
      .map((b) => ({
        symbol: opts.symbol.toUpperCase(),
        timeframe: opts.timeframe,
        time: Math.floor(new Date(b.tradingDate).getTime() / 1000),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
        closed: true,
      }))
      .filter((c) => this.isValid(c))
      .sort((a, b) => a.time - b.time);
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
