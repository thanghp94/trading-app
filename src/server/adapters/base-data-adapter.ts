import { EventEmitter } from 'node:events';
import type { AdapterState, Candle, Timeframe } from '../../shared/types.js';

export interface AdapterEvents {
  candle: (candle: Candle) => void;
  state: (state: AdapterState) => void;
  error: (err: Error) => void;
}

export interface BackfillOptions {
  symbol: string;
  timeframe: Timeframe;
  /** Number of historical bars to fetch. */
  limit: number;
  /** When set, fetch bars strictly after this unix-second timestamp (used for gap-fill). */
  sinceSec?: number;
}

/**
 * Abstract data adapter. Each broker implements only the protocol-specific
 * methods (login, parseTick, subscribe, refresh). Common lifecycle —
 * REST backfill on cold start, REST gap-fill on reconnect, candle validation,
 * market-hours filter — lives here.
 *
 * Lifecycle (single subscription):
 *   start()
 *     → state=backfilling → fetchHistorical(limit=N) → emit snapshot
 *     → state=connecting  → openLive()
 *     → state=live        → emit tick on each parseTick
 *   on disconnect:
 *     → state=reconnecting (reconnecting-websocket handles backoff)
 *   on reconnect:
 *     → state=gap-filling  → fetchHistorical(sinceSec=lastTs)
 *     → state=live
 */
export abstract class BaseDataAdapter extends EventEmitter {
  protected lastCandleTs = new Map<string, number>(); // key=`${symbol}:${tf}`

  /** Backfill historical bars, validate, drop bad data, emit. */
  abstract fetchHistorical(opts: BackfillOptions): Promise<Candle[]>;

  /** Open the live stream for one or more (symbol, timeframe) pairs. */
  abstract openLive(subs: Array<{ symbol: string; timeframe: Timeframe }>): Promise<void>;

  /** Close all live connections. */
  abstract close(): Promise<void>;

  /**
   * Validate a candle. Drops NaN/negative/inverted bars at the adapter
   * boundary so bad broker data never poisons indicator state.
   */
  protected isValid(c: Candle): boolean {
    if (![c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)) return false;
    if (c.high < c.low) return false;
    if (c.open < 0 || c.close < 0 || c.volume < 0) return false;
    return true;
  }

  protected emitCandle(candle: Candle): void {
    if (!this.isValid(candle)) return;
    const key = `${candle.symbol}:${candle.timeframe}`;
    if (candle.closed) this.lastCandleTs.set(key, candle.time);
    this.emit('candle', candle);
  }

  protected setState(state: AdapterState): void {
    this.emit('state', state);
  }

  /** Last finalized bar timestamp seen for this stream — used for gap-fill. */
  protected getSinceSec(symbol: string, timeframe: Timeframe): number | undefined {
    return this.lastCandleTs.get(`${symbol}:${timeframe}`);
  }
}
