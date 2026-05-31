import type { Candle } from "../types.js";

export interface Dmi {
  plusDI: number[];
  minusDI: number[];
  adx: number[];
}

/**
 * Wilder's Directional Movement Index. Produces +DI, −DI and ADX aligned to
 * candle index. +DI/−DI become valid at index `period`; ADX at index
 * `2*period − 1` (it smooths `period` DX values). NaN before warmup.
 */
export function dmi(candles: Candle[], period = 14): Dmi {
  const len = candles.length;
  const plusDI = new Array<number>(len).fill(NaN);
  const minusDI = new Array<number>(len).fill(NaN);
  const adx = new Array<number>(len).fill(NaN);
  if (len < period + 1) return { plusDI, minusDI, adx };

  const tr = new Array<number>(len).fill(0);
  const plusDM = new Array<number>(len).fill(0);
  const minusDM = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close),
    );
  }

  // Wilder smoothing seeded with the sum over the first `period` moves (idx 1..period).
  let smTR = 0;
  let smPlus = 0;
  let smMinus = 0;
  for (let i = 1; i <= period; i += 1) {
    smTR += tr[i];
    smPlus += plusDM[i];
    smMinus += minusDM[i];
  }

  const dx = new Array<number>(len).fill(NaN);
  const computeDI = (idx: number) => {
    const pdi = smTR === 0 ? 0 : (100 * smPlus) / smTR;
    const mdi = smTR === 0 ? 0 : (100 * smMinus) / smTR;
    plusDI[idx] = pdi;
    minusDI[idx] = mdi;
    const sum = pdi + mdi;
    dx[idx] = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
  };
  computeDI(period);
  for (let i = period + 1; i < len; i += 1) {
    smTR = smTR - smTR / period + tr[i];
    smPlus = smPlus - smPlus / period + plusDM[i];
    smMinus = smMinus - smMinus / period + minusDM[i];
    computeDI(i);
  }

  // ADX = Wilder smoothing of DX. First ADX = mean of DX[period .. 2*period−1].
  const firstAdxIdx = 2 * period;
  if (len >= firstAdxIdx) {
    let sumDX = 0;
    for (let i = period; i < firstAdxIdx; i += 1) sumDX += dx[i];
    let prevAdx = sumDX / period;
    adx[firstAdxIdx - 1] = prevAdx;
    for (let i = firstAdxIdx; i < len; i += 1) {
      prevAdx = (prevAdx * (period - 1) + dx[i]) / period;
      adx[i] = prevAdx;
    }
  }

  return { plusDI, minusDI, adx };
}
