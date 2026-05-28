import type { BlackboxSignals, Cycle, CycleData } from "./types.js";

/** Local trough turning up at the last bar, with the trough below `threshold`. */
function turnsUpFromBelow(s: number[], threshold: number): boolean {
  const i = s.length - 1;
  if (i < 2) return false;
  const [a, b, c] = [s[i - 2], s[i - 1], s[i]];
  if (![a, b, c].every(Number.isFinite)) return false;
  return b <= a && c > b && b < threshold; // trough at i-1, now rising
}

/** Local peak turning down at the last bar, with the peak above `threshold`. */
function turnsDownFromAbove(s: number[], threshold: number): boolean {
  const i = s.length - 1;
  if (i < 2) return false;
  const [a, b, c] = [s[i - 2], s[i - 1], s[i]];
  if (![a, b, c].every(Number.isFinite)) return false;
  return b >= a && c < b && b > threshold; // peak at i-1, now falling
}

/** Last N daily values all strictly positive (negative for `dir = -1`). */
function consecutive(net: number[], n: number, dir: 1 | -1): boolean {
  if (net.length < n) return false;
  for (let k = 0; k < n; k += 1) {
    const v = net[net.length - 1 - k];
    if (!Number.isFinite(v) || Math.sign(v) !== dir) return false;
  }
  return true;
}

/** Zero-cross of `s` at the last bar: +1 up-cross, -1 down-cross, 0 none. */
function zeroCross(s: number[]): -1 | 0 | 1 {
  const i = s.length - 1;
  if (i < 1) return 0;
  const a = s[i - 1];
  const b = s[i];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  if (a <= 0 && b > 0) return 1;
  if (a >= 0 && b < 0) return -1;
  return 0;
}

/**
 * Detect QMV trading signals at the latest bar.
 * Uốn signals read CHDMx (normalized 0-100); the TURN at an extreme is the
 * trigger, not the zone alone (manual p16). Confluence across cycles escalates
 * confidence: T+ (3&5) → T++ (+10) → theo sóng (+20).
 */
export function computeSignals(
  cycles: Record<Cycle, CycleData>,
  netDaily: number[],
): BlackboxSignals {
  const c3 = cycles[3].chdm;
  const c5 = cycles[5].chdm;
  const c10 = cycles[10].chdm;
  const c20 = cycles[20].chdm;

  const up3 = turnsUpFromBelow(c3, 30);
  const up5 = turnsUpFromBelow(c5, 30);
  const up10 = turnsUpFromBelow(c10, 30);
  const up20 = turnsUpFromBelow(c20, 30);

  const coHoiTplus = up3 && up5;
  const coHoiTplusplus = coHoiTplus && up10;
  const coHoiTheoSong = coHoiTplusplus && up20;

  const speed3 = cycles[3].speed;
  const cross = zeroCross(speed3);

  return {
    uonLen20: turnsUpFromBelow(c3, 20) || turnsUpFromBelow(c5, 20),
    uonLen30: up3 || up5,
    uonXuong70: turnsDownFromAbove(c3, 70) || turnsDownFromAbove(c5, 70),
    uonXuong80: turnsDownFromAbove(c3, 80) || turnsDownFromAbove(c5, 80),
    tienVaoHomNay: consecutive(netDaily, 1, 1),
    tienVao2Phien: consecutive(netDaily, 2, 1),
    tienVao3Phien: consecutive(netDaily, 3, 1),
    tienRaHomNay: consecutive(netDaily, 1, -1),
    tienRa2Phien: consecutive(netDaily, 2, -1),
    tienRa3Phien: consecutive(netDaily, 3, -1),
    daoChieuTangTplus: cross === 1,
    daoChieuGiamTplus: cross === -1,
    coHoiTplus,
    coHoiTplusplus,
    coHoiTheoSong,
  };
}
