import type { BBStatus, XHCau } from "./blackbox/types.js";
import type { IchimokuSignal } from "./indicators/ichimoku.js";
import type { Divergence } from "./indicators/divergence.js";

/** TA signals for a screener row (the QMV "Tín hiệu kỹ thuật" + price columns). */
export interface ScreenerSignals {
  trend: "up" | "down" | "side";
  /** Reversal pattern formed recently (double-bottom / inverse H&S = bullish). */
  bullishPattern: boolean;
  bearishPattern: boolean;
  /** KL đột biến — last bar volume spike vs SMA(20). */
  volumeSpike: boolean;
  rsi: number;
  rsiZone: "oversold" | "overbought" | null;
  /** Active S/R zone touched on the last bar. */
  zoneTouch: "support" | "resistance" | null;
  newHigh: boolean;
  newLow: boolean;
  /** Ichimoku tốt/xấu — bullish/bearish cloud structure. */
  ichimoku: IchimokuSignal;
  /** Phân kỳ — RSI divergence (regular + hidden). */
  divergence: Divergence;
}

/**
 * Blackbox columns — DISPLAY ONLY. Derived from the OHLCV proxy which failed
 * the predictive gate (see plan blackbox-math.md). Shown as context, never a
 * ranking input. `proxy: true` flags this in the UI.
 */
export interface ScreenerBlackbox {
  tmc: number;
  bbStatus: BBStatus;
  xhCau: XHCau;
  uonLen: boolean;
  uonXuong: boolean;
  /** Consecutive sessions of net money-in (0-3+). */
  tienVaoPhien: number;
  /** Tốc độ (DM−DS) positive at last bar. */
  tocDoUp: boolean;
  proxy: true;
}

export interface ScreenerRow {
  symbol: string;
  sector: string;
  close: number;
  changePct: number;
  volume: number;
  /** Composite TA rating 1-5 (QMV-style ★). */
  star: number;
  score: number;
  signals: ScreenerSignals;
  blackbox: ScreenerBlackbox;
  reasons: string[];
  /** Bar time of the latest candle (unix sec). */
  asOf: number;
  /** Fundamentals attached from the nightly cache (absent when not cached). */
  fundamentals?: ScreenerFundamentals;
}

/**
 * Fundamentals columns for the screener, attached from the cache (never fetched
 * inline). `valueScore` is a heuristic value-tilt (0-100), not a predictive signal.
 */
export interface ScreenerFundamentals {
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
  marketCap: number | null;
  dividendYield: number | null;
  /** Composite value score 0-100 (low P/E·P/B, high ROE·yield), or null if no inputs. */
  valueScore: number | null;
}
