// Numeric helpers for blackbox series. Pure, index-aligned, NaN-warmup style
// matching src/shared/indicators/*.

/** Simple moving average. First `period-1` entries are NaN. */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period || period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Trailing sum over `window` bars. First `window-1` entries are NaN. */
export function trailingSum(values: number[], window: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (window <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum;
  }
  return out;
}

/**
 * Min-max normalize to 0..100 over a trailing `window` (the QMV "Chuẩn hóa"
 * 50-session mode). Point-in-time: uses only data ≤ t (no look-ahead).
 * Flat window (max==min) → 50.
 */
export function rollingNormalize(
  values: number[],
  window = 50,
  scale = 100,
): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    if (i - start + 1 < Math.min(window, 2)) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = start; j <= i; j += 1) {
      const v = values[j];
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    out[i] = hi === lo ? scale / 2 : ((values[i] - lo) / (hi - lo)) * scale;
  }
  return out;
}

/**
 * Min-max normalize to 0..1 anchored over the FULL series (QMV "Mặc định" /
 * from-base-day mode). Whole curve rescales when a new extreme appears, so this
 * is for display redrawn daily — NOT a point-in-time signal. Stores derive this
 * from the raw cumulative on read.
 */
export function anchorNormalize(values: number[]): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo) || hi === lo) return values.map(() => 0.5);
  return values.map((v) => (Number.isFinite(v) ? (v - lo) / (hi - lo) : NaN));
}

/** Direction of slope at t vs t-1: +1 rising, -1 falling, 0 flat/unknown. */
export function slopeSign(values: number[], i: number): -1 | 0 | 1 {
  if (i <= 0) return 0;
  const a = values[i];
  const b = values[i - 1];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}
