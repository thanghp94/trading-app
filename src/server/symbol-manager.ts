import type { Candle, Timeframe } from '../shared/types.js';
import { BinanceAdapter } from './adapters/binance-adapter.js';
import { OandaAdapter } from './adapters/oanda-adapter.js';
import type { BaseDataAdapter } from './adapters/base-data-adapter.js';

interface SubKey {
  symbol: string;
  timeframe: Timeframe;
}

/**
 * Symbols that should be routed to OANDA (forex pairs + spot metals).
 * Easily extended — add a 6-char symbol or one already containing `_`.
 */
const OANDA_SYMBOLS = new Set([
  'XAUUSD', 'XAGUSD',
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
  'EURJPY', 'GBPJPY', 'EURGBP',
]);

function isOandaSymbol(symbol: string): boolean {
  return OANDA_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * Routes (symbol, timeframe) subscriptions to the right adapter.
 *
 * - Crypto (BTCUSDT, ETHUSDT, PAXGUSDT, …) → BinanceAdapter
 * - Forex + spot metals (XAUUSD, EURUSD, …) → OandaAdapter
 * - VN equities (W3.2)                       → DnseAdapter or SsiAdapter
 *
 * OANDA adapter is only constructed when a token is configured. If the user
 * subscribes to an OANDA symbol without setup, we return a clear error.
 */
export class SymbolManager {
  private adapters = new Map<string, BaseDataAdapter>();
  private subs = new Set<string>(); // `${symbol}:${timeframe}`
  private oandaToken: string | undefined;

  constructor(private onCandle: (c: Candle) => void, private onError: (err: Error) => void) {
    const binance = new BinanceAdapter();
    binance.on('candle', (c) => this.onCandle(c));
    binance.on('error', (err) => this.onError(err));
    this.adapters.set('binance', binance);

    this.oandaToken = process.env.OANDA_API_TOKEN;
    if (this.oandaToken) {
      const oanda = new OandaAdapter(this.oandaToken);
      oanda.on('candle', (c) => this.onCandle(c));
      oanda.on('error', (err) => this.onError(err));
      this.adapters.set('oanda', oanda);
    }
  }

  private adapterFor(symbol: string): BaseDataAdapter {
    if (isOandaSymbol(symbol)) {
      const oanda = this.adapters.get('oanda');
      if (!oanda) {
        throw new Error(
          `Symbol "${symbol}" requires OANDA but OANDA_API_TOKEN is not set. ` +
            `Add it to .env and restart the server.`,
        );
      }
      return oanda;
    }
    return this.adapters.get('binance')!;
  }

  async subscribe({ symbol, timeframe }: SubKey, backfillLimit = 1000): Promise<Candle[]> {
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
