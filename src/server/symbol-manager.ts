import type { Candle, Timeframe } from '../shared/types.js';
import { BinanceAdapter } from './adapters/binance-adapter.js';
import { OandaAdapter } from './adapters/oanda-adapter.js';
import { TcbsAdapter } from './adapters/tcbs-adapter.js';
import { TwelveDataAdapter } from './adapters/twelvedata-adapter.js';
import type { BaseDataAdapter } from './adapters/base-data-adapter.js';

interface SubKey {
  symbol: string;
  timeframe: Timeframe;
}

/**
 * Symbols that should be routed to a forex/metals adapter (TwelveData by
 * default, OANDA fallback). Crypto stays on Binance.
 */
const FX_METALS_SYMBOLS = new Set([
  'XAUUSD', 'XAGUSD',
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
  'EURJPY', 'GBPJPY', 'EURGBP',
]);

function isFxMetalsSymbol(symbol: string): boolean {
  return FX_METALS_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * VN equity tickers: 3-letter all-caps (HPG, VCB, FPT, MWG, VHM, ...) or
 * a small set of derivative codes (VN30F1M, VN30F2M, ...). Routed to TCBS
 * by default — no signup, ~1 minute delayed.
 */
function isVnEquitySymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (/^VN30F\d/.test(s)) return true; // VN30 index futures
  if (/^[A-Z]{3}$/.test(s)) return true; // standard HOSE/HNX/UPCOM ticker
  return false;
}

/**
 * Routes (symbol, timeframe) subscriptions to the right adapter.
 *
 * - Crypto (BTCUSDT, PAXGUSDT, …)        → BinanceAdapter (free, public WS)
 * - Forex + spot metals (XAUUSD, EURUSD) → TwelveData (works in VN) or
 *                                           OANDA (blocked in VN, kept as
 *                                           opt-in fallback for users who
 *                                           can reach it)
 * - VN equities (W3.2)                    → DnseAdapter or SsiAdapter
 *
 * Adapters are constructed only when their credentials are configured.
 * Trying to subscribe to an FX/metals symbol with no provider configured
 * returns a clear error.
 */
export class SymbolManager {
  private adapters = new Map<string, BaseDataAdapter>();
  private subs = new Set<string>(); // `${symbol}:${timeframe}`

  constructor(private onCandle: (c: Candle) => void, private onError: (err: Error) => void) {
    const binance = new BinanceAdapter();
    binance.on('candle', (c) => this.onCandle(c));
    binance.on('error', (err) => this.onError(err));
    this.adapters.set('binance', binance);

    if (process.env.TWELVEDATA_API_KEY) {
      const td = new TwelveDataAdapter(process.env.TWELVEDATA_API_KEY);
      td.on('candle', (c) => this.onCandle(c));
      td.on('error', (err) => this.onError(err));
      this.adapters.set('twelvedata', td);
    }
    if (process.env.OANDA_API_TOKEN) {
      const oanda = new OandaAdapter(process.env.OANDA_API_TOKEN);
      oanda.on('candle', (c) => this.onCandle(c));
      oanda.on('error', (err) => this.onError(err));
      this.adapters.set('oanda', oanda);
    }
    // TCBS needs no auth — always available for VN tickers.
    const tcbs = new TcbsAdapter();
    tcbs.on('candle', (c) => this.onCandle(c));
    tcbs.on('error', (err) => this.onError(err));
    this.adapters.set('tcbs', tcbs);
  }

  private adapterFor(symbol: string): BaseDataAdapter {
    if (isFxMetalsSymbol(symbol)) {
      const td = this.adapters.get('twelvedata');
      if (td) return td;
      const oanda = this.adapters.get('oanda');
      if (oanda) return oanda;
      throw new Error(
        `Symbol "${symbol}" requires a forex/metals provider. ` +
          `Set TWELVEDATA_API_KEY in .env (free at twelvedata.com) and restart the server.`,
      );
    }
    if (isVnEquitySymbol(symbol)) {
      return this.adapters.get('tcbs')!;
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
