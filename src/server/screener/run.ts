import type { Candle } from "../../shared/types.js";
import type { ScreenerRow } from "../../shared/screener-types.js";
import { getSector } from "../market/sector-map.js";
import { computeBlackbox } from "../../shared/blackbox/compute.js";
import { computeTaSignals } from "./ta-signals.js";
import { scoreFromSignals } from "./score.js";

export type CandleFetcher = (symbol: string) => Promise<Candle[]>;

const MIN_BARS = 60;

/** Build one screener row from a symbol's daily candles. Null if too few bars. */
export function buildRow(
  symbol: string,
  candles: Candle[],
): ScreenerRow | null {
  if (candles.length < MIN_BARS) return null;
  const i = candles.length - 1;
  const last = candles[i];
  const prevClose = candles[i - 1].close;

  const signals = computeTaSignals(candles);
  const { score, star, reasons } = scoreFromSignals(signals);

  // Blackbox = display-only (proxy failed predictive gate).
  const bb = computeBlackbox(candles);
  const tienVaoPhien = bb.signals.tienVao3Phien
    ? 3
    : bb.signals.tienVao2Phien
      ? 2
      : bb.signals.tienVaoHomNay
        ? 1
        : 0;

  return {
    symbol,
    sector: getSector(symbol),
    close: last.close,
    changePct: prevClose > 0 ? ((last.close - prevClose) / prevClose) * 100 : 0,
    volume: last.volume,
    star,
    score,
    signals,
    blackbox: {
      tmc: bb.tmc[i],
      bbStatus: bb.bbStatus,
      xhCau: bb.xhCau,
      uonLen: bb.signals.uonLen20 || bb.signals.uonLen30,
      uonXuong: bb.signals.uonXuong70 || bb.signals.uonXuong80,
      tienVaoPhien,
      tocDoUp: (bb.cycles[3].speed[i] ?? 0) > 0,
      proxy: true,
    },
    reasons,
    asOf: last.time,
  };
}

/**
 * Scan a universe: fetch daily candles per symbol, build rows, rank by ★ then
 * score. Sequential fetch to respect the keyless Entrade rate limits. Symbols
 * that fail to fetch or have too little history are skipped (logged by caller).
 */
export async function runScreener(
  symbols: string[],
  fetchCandles: CandleFetcher,
): Promise<ScreenerRow[]> {
  const rows: ScreenerRow[] = [];
  for (const symbol of symbols) {
    try {
      const candles = await fetchCandles(symbol);
      const row = buildRow(symbol, candles);
      if (row) rows.push(row);
    } catch {
      // skip unreachable / bad-data symbols; partial results are still useful
    }
  }
  rows.sort((a, b) => b.star - a.star || b.score - a.score);
  return rows;
}
