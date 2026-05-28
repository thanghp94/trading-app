import type { Cycle, CycleData, XHCau } from "./types.js";

/**
 * DSPI — demand vs supply cycle, normalized −1..+1 (0 neutral).
 * Uses the 20-day window (QMV "Chu kỳ cung cầu ~1 tháng"):
 *   dspi = (DM20 − DS20) / (DM20 + DS20)   — net buy fraction, inherently bounded.
 * >0 = cầu mạnh hơn cung; <0 = cung mạnh hơn cầu.
 */
export function computeDspi(cycles: Record<Cycle, CycleData>): number[] {
  const { dm, ds } = cycles[20];
  return dm.map((m, i) => {
    const s = ds[i];
    if (!Number.isFinite(m) || !Number.isFinite(s)) return NaN;
    const total = m + s;
    return total > 0 ? (m - s) / total : 0;
  });
}

/**
 * XH Cầu (demand cycle state) from DSPI level + slope at the latest bar.
 *   cau-khoe : dspi > 0 and rising
 *   bao-hoa  : dspi high (>0.3) and turning down  (cầu about to peak)
 *   cau-yeu  : dspi < 0 and falling
 *   duy-tri  : dspi low/negative but flattening (about to recover)
 */
export function classifyXHCau(dspi: number[]): XHCau {
  const n = dspi.length;
  if (n === 0) return "duy-tri";
  const i = n - 1;
  // last two finite values for slope
  let cur = NaN;
  let prev = NaN;
  for (let j = i; j >= 0; j -= 1) {
    if (Number.isFinite(dspi[j])) {
      if (Number.isNaN(cur)) cur = dspi[j];
      else {
        prev = dspi[j];
        break;
      }
    }
  }
  if (Number.isNaN(cur)) return "duy-tri";
  const rising = Number.isNaN(prev) ? cur >= 0 : cur >= prev;

  if (cur > 0.3 && !rising) return "bao-hoa";
  if (cur < 0 && !rising) return "cau-yeu";
  if (cur < 0 && rising) return "duy-tri";
  return rising ? "cau-khoe" : "bao-hoa";
}
