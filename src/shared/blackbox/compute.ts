import type { Candle } from "../types.js";
import type { BlackboxResult } from "./types.js";
import { moneyFlowProxy } from "./money-flow-proxy.js";
import { cumulativeBox, boxTrend, classifyBBStatus } from "./box-level.js";
import { cycleSeries } from "./cycles.js";
import { computeDspi, classifyXHCau } from "./indices.js";
import { computeSignals } from "./signals.js";

/**
 * Compute the full blackbox result for one symbol from its daily candles.
 * Input must be ascending by time, daily timeframe, finalized bars.
 * [PROXY] — DM/DS are OHLCV-derived, not real tick flow. See blackbox-math.md.
 */
export function computeBlackbox(
  candles: Candle[],
  demandWeight = 1,
): BlackboxResult {
  const symbol = candles[0]?.symbol ?? "";
  const flows = moneyFlowProxy(candles);
  const netDaily = flows.map((f) => f.dm - f.ds);

  const boxRaw = cumulativeBox(flows, demandWeight);
  const trend = boxTrend(boxRaw);
  const cycles = cycleSeries(flows);
  const dspi = computeDspi(cycles);

  return {
    symbol,
    times: flows.map((f) => f.time),
    boxRaw,
    tmc: trend.tmc,
    tma20: trend.tma20,
    tma50: trend.tma50,
    cycles,
    dspi,
    bbStatus: classifyBBStatus(trend),
    xhCau: classifyXHCau(dspi),
    signals: computeSignals(cycles, netDaily),
    proxy: true,
  };
}
