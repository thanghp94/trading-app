import type { DailyFlow, BBStatus } from "./types.js";
import { anchorNormalize, sma } from "./util.js";

/**
 * Cumulative box level = Σ (dm − demandWeight·ds) from the anchor day.
 * This is "how full the box is" (the closed-box stock of money).
 * demandWeight > 1 reflects QMV weighting cầu > cung; default 1 (net A/D).
 * Returns the RAW cumulative — store this, derive TMC on read (anchor-norm is
 * non-stationary).
 */
export function cumulativeBox(flows: DailyFlow[], demandWeight = 1): number[] {
  const out = new Array<number>(flows.length);
  let acc = 0;
  for (let i = 0; i < flows.length; i += 1) {
    acc += flows[i].dm - demandWeight * flows[i].ds;
    out[i] = acc;
  }
  return out;
}

/** TMC = boxRaw anchor-normalized 0..1 (display; redraw daily). */
export function tmcFromBox(boxRaw: number[]): number[] {
  return anchorNormalize(boxRaw);
}

export interface BoxTrend {
  tmc: number[];
  tma20: number[];
  tma50: number[];
}

export function boxTrend(boxRaw: number[]): BoxTrend {
  const tmc = tmcFromBox(boxRaw);
  return { tmc, tma20: sma(tmc, 20), tma50: sma(tmc, 50) };
}

/**
 * BB-Status from TMC vs its moving averages at the latest bar.
 *   tien-khoe : tmc > tma20 > tma50 and rising
 *   bao-hoa   : tmc high (>0.7) and slope turning down/flat  (money about to leave)
 *   tien-yeu  : tmc < tma20 < tma50 and falling
 *   duy-tri   : tmc low and slope flattening (about to refill) — preferred over bao-hoa
 */
export function classifyBBStatus(trend: BoxTrend): BBStatus {
  const n = trend.tmc.length;
  if (n === 0) return "duy-tri";
  const i = n - 1;
  const tmc = trend.tmc[i];
  const a20 = trend.tma20[i];
  const a50 = trend.tma50[i];
  const prev = i > 0 ? trend.tmc[i - 1] : tmc;
  const rising = tmc >= prev;
  const high = tmc > 0.7;
  const low = tmc < 0.3;

  if (Number.isFinite(a20) && Number.isFinite(a50)) {
    if (tmc > a20 && a20 > a50 && rising) return "tien-khoe";
    if (tmc < a20 && a20 < a50 && !rising) return "tien-yeu";
  }
  if (high && !rising) return "bao-hoa";
  if (low && rising) return "duy-tri";
  return rising ? "tien-khoe" : "tien-yeu";
}
