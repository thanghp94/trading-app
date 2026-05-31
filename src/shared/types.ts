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

export interface DepthSnapshot {
  symbol: string;
  bids: [number, number][]; // [price, quantity]
  asks: [number, number][]; // [price, quantity]
  timestamp: number;
}

export type ServerMessage =
  | { type: 'snapshot'; symbol: string; timeframe: Timeframe; candles: Candle[] }
  | { type: 'tick'; candle: Candle }
  | { type: 'status'; symbol: string; timeframe: Timeframe; state: AdapterState }
  | { type: 'error'; message: string }
  | { type: 'alert'; alert: Alert }
  | { type: 'alert-history'; alerts: Alert[] }
  | { type: 'depth'; depth: DepthSnapshot };

// ───────── Alerts ─────────

export interface Alert {
  id: string;
  /** Rule key, e.g. 'wave-3-entry'. */
  rule: string;
  symbol: string;
  timeframe: Timeframe;
  /** Bar time the rule fired against (unix seconds). */
  time: number;
  /** Bull / bear bias. */
  direction: 'bull' | 'bear';
  /** Price at the moment the rule fired (typically the bar close). */
  price: number;
  /** Short headline for Telegram + UI. */
  headline: string;
  /** Optional structured payload for downstream (journal, AI). */
  meta?: Record<string, unknown>;
  /** AI summary attached after the fact when ANALYZE_ON_ALERT=true. */
  aiSummary?: string;
}

export type AdapterState =
  | 'connecting'
  | 'backfilling'
  | 'live'
  | 'reconnecting'
  | 'gap-filling'
  | 'closed';

// ───────── S/R zones ─────────

export type ZoneType = 'support' | 'resistance';
export type ZoneState = 'active' | 'broken';

export interface Zone {
  id: string;
  type: ZoneType;
  state: ZoneState;
  /** Top of the zone (price). */
  top: number;
  /** Bottom of the zone (price). */
  bottom: number;
  /** Time of the earliest pivot in the cluster (unix sec). */
  formedAt: number;
  /** Time the zone was broken (close beyond), if any (unix sec). */
  brokenAt?: number;
  /** True if this zone was broken and then flipped to the opposite type via role reversal. */
  flipped: boolean;
  /**
   * Sum of pivot strengths in the cluster. Higher = stronger zone.
   * Used to drive opacity in rendering, scoring in the watchlist scanner,
   * and AI-prompt context. Encodes the teacher's manual volume-arrow
   * intuition: pivots with conspicuous volume + sharp rejection contribute
   * more to the zone than weak fractals.
   */
  strength?: number;
  /** Number of pivots in the cluster — secondary indicator of multi-touch zones. */
  pivotCount?: number;
}
