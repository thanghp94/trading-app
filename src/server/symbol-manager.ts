import type { Candle, Timeframe } from '../shared/types.js';
import { BinanceAdapter } from './adapters/binance-adapter.js';
import type { BaseDataAdapter } from './adapters/base-data-adapter.js';

interface SubKey {
  symbol: string;
  timeframe: Timeframe;
}

/**
 * Routes (symbol, timeframe) subscriptions to the right adapter and keeps
 * track of which ones are active. Weekend 1 = binance only.
 */
export class SymbolManager {
  private adapters = new Map<string, BaseDataAdapter>();
  private subs = new Set<string>(); // `${symbol}:${timeframe}`

  constructor(private onCandle: (c: Candle) => void, private onError: (err: Error) => void) {
    const binance = new BinanceAdapter();
    binance.on('candle', (c) => this.onCandle(c));
    binance.on('error', (err) => this.onError(err));
    this.adapters.set('binance', binance);
  }

  private adapterFor(_symbol: string): BaseDataAdapter {
    // Weekend 1 routing: everything is crypto = binance.
    // Weekend 3-4: route VN tickers → DNSE, FX → OANDA, etc.
    return this.adapters.get('binance')!;
  }

  async subscribe({ symbol, timeframe }: SubKey, backfillLimit = 100): Promise<Candle[]> {
    const key = `${symbol}:${timeframe}`;
    const adapter = this.adapterFor(symbol);
    const history = await adapter.fetchHistorical({ symbol, timeframe, limit: backfillLimit });
    if (!this.subs.has(key)) {
      this.subs.add(key);
      await adapter.openLive([{ symbol, timeframe }]);
    }
    return history;
  }

  async closeAll(): Promise<void> {
    await Promise.all(Array.from(this.adapters.values()).map((a) => a.close()));
  }
}
