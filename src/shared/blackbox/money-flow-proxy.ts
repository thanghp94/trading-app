import type { Candle } from "../types.js";
import type { DailyFlow } from "./types.js";

/**
 * [PROXY] Estimate per-day box flow (money-in DM, value-out DS) from OHLCV.
 *
 * Real QMV DM/DS come from tick-level active money flow (split Cáo/Sói/Thỏ).
 * We don't have tick data, so we split each day's traded VALUE (close×volume)
 * into demand vs supply using the Close Location Value (Williams A/D style):
 *
 *   clv = ((close−low) − (high−close)) / (high−low)   ∈ [−1, +1]
 *   buyFrac = (clv + 1) / 2                            ∈ [0, 1]
 *   value   = close × volume
 *   dm = buyFrac × value          (cầu — money in)
 *   ds = (1 − buyFrac) × value    (cung — value out)
 *   ⇒ speed/net = dm − ds = clv × value
 *
 * Strong close (near high) → mostly demand; weak close (near low) → distribution.
 * Same units for dm/ds so Tốc độ = dm−ds is meaningful. This is an approximation
 * (~60% of QMV's signal); label everything `proxy` downstream.
 */
export function moneyFlowProxy(candles: Candle[]): DailyFlow[] {
  const out: DailyFlow[] = [];
  for (const c of candles) {
    const range = c.high - c.low;
    // Doji / zero-range bar → neutral split.
    const clv = range > 0 ? (c.close - c.low - (c.high - c.close)) / range : 0;
    const buyFrac = (clv + 1) / 2;
    const value = c.close * c.volume;
    out.push({
      time: c.time,
      close: c.close,
      volume: c.volume,
      dm: buyFrac * value,
      ds: (1 - buyFrac) * value,
    });
  }
  return out;
}
