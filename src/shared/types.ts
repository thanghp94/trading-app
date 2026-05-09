// Wire types shared between server and web client.

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Candle {
  symbol: string;
  timeframe: Timeframe;
  /** Bar open time, unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** True when the bar has finalized. Live ticks update an unfinalized bar. */
  closed: boolean;
}

export type ClientMessage =
  | { type: 'subscribe'; symbol: string; timeframe: Timeframe }
  | { type: 'unsubscribe'; symbol: string; timeframe: Timeframe };

export type ServerMessage =
  | { type: 'snapshot'; symbol: string; timeframe: Timeframe; candles: Candle[] }
  | { type: 'tick'; candle: Candle }
  | { type: 'status'; symbol: string; timeframe: Timeframe; state: AdapterState }
  | { type: 'error'; message: string };

export type AdapterState =
  | 'connecting'
  | 'backfilling'
  | 'live'
  | 'reconnecting'
  | 'gap-filling'
  | 'closed';
