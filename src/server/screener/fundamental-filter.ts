import type {
  ScreenerRow,
  ScreenerFundamentals,
} from "../../shared/screener-types.js";
import type { Fundamentals } from "../fundamentals/types.js";

/** Linear score in [0,100]: `best` maps to 100, `worst` to 0, clamped. */
function lerpScore(v: number, best: number, worst: number): number {
  const t = (v - worst) / (best - worst);
  return Math.max(0, Math.min(100, t * 100));
}

/**
 * Composite value score 0-100 — a value-investing tilt, NOT a predictive signal.
 * Weighted average over whatever components are present; null when none are.
 *   ROE 0.40 (0→0.25), P/E 0.30 (30→8), P/B 0.20 (4→1), div yield 0.10 (0→0.06).
 */
export function computeValueScore(v: {
  pe: number | null;
  pb: number | null;
  roe: number | null;
  dividendYield: number | null;
}): number | null {
  const parts: Array<{ w: number; s: number }> = [];
  if (v.roe != null) parts.push({ w: 0.4, s: lerpScore(v.roe, 0.25, 0) });
  if (v.pe != null && v.pe > 0)
    parts.push({ w: 0.3, s: lerpScore(v.pe, 8, 30) });
  if (v.pb != null && v.pb > 0)
    parts.push({ w: 0.2, s: lerpScore(v.pb, 1, 4) });
  if (v.dividendYield != null)
    parts.push({ w: 0.1, s: lerpScore(v.dividendYield, 0.06, 0) });

  if (parts.length === 0) return null;
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const score = parts.reduce((a, p) => a + p.w * p.s, 0) / wsum;
  return Math.round(score);
}

/** Map a cached `Fundamentals` to the screener's fundamentals columns. */
export function toScreenerFundamentals(f: Fundamentals): ScreenerFundamentals {
  const v = f.valuation;
  return {
    pe: v.pe,
    pb: v.pb,
    roe: v.roe,
    eps: v.eps,
    marketCap: v.marketCap,
    dividendYield: v.dividendYield,
    valueScore: computeValueScore(v),
  };
}

/**
 * Attach cached fundamentals to screener rows. Cache-only — never spawns the
 * python fetch (keeps a scan fast). Rows with no cached fundamentals are left
 * as-is (no `fundamentals` field).
 */
export function enrichRows(
  rows: ScreenerRow[],
  getFundamentals: (symbol: string) => Fundamentals | null,
): ScreenerRow[] {
  return rows.map((row) => {
    const f = getFundamentals(row.symbol);
    return f ? { ...row, fundamentals: toScreenerFundamentals(f) } : row;
  });
}
