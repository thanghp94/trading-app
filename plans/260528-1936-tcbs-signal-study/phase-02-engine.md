# Phase 02 — Signal Catalog + Study Engine

## Overview
- Priority: P0. Depends on Phase 01.
- Core compute: candles → forward-return matrix + per-year breakdown + per-signal detail.
- Files under new `src/server/signal-study/`.

## Files to create

### `src/server/signal-study/types.ts`
```ts
export const HORIZONS = [3, 5, 10, 20, 60, 180] as const;
export type Horizon = (typeof HORIZONS)[number];

export interface SignalRow {
  key: string; labelVi: string; labelEn: string;
  avgByHorizon: Record<Horizon, number | null>;   // mean fwd return % (null = too few)
  winByHorizon: Record<Horizon, number | null>;    // win prob % (>0)
  avgOverall: number | null;                        // "Trung bình" column
  events: number;                                   // total fired (post-cooldown)
}
export interface SignalDetail {
  key: string; labelVi: string;
  eventIdx: number[];                               // bar indices of fires (chart markers)
  avgByHorizon: Record<Horizon, number | null>;
  winByHorizon: Record<Horizon, number | null>;
  optimalAvgHorizon: Horizon | null;                // max avg return
  optimalWinHorizon: Horizon | null;                // max win prob
  bestPeriod: { horizon: Horizon; year: number; value: number } | null;
  worstPeriod: { horizon: Horizon; year: number; value: number } | null;
  donut: { win: number; breakeven: number; loss: number; total: number }; // at optimalAvgHorizon
  perYearAvg: Array<{ year: number; byHorizon: Record<Horizon, number | null>; overall: number | null }>;
  perYearWin: Array<{ year: number; byHorizon: Record<Horizon, number | null>; overall: number | null }>;
}
export interface StudyResult {
  symbol: string;
  bars: number; fromTime: number; toTime: number;
  rows: SignalRow[];
  details: Record<string, SignalDetail>;
  conclusion: { shortTerm?: { key: string; horizon: Horizon; value: number };
                longTerm?: { key: string; horizon: Horizon; value: number };
                recent7d: boolean };               // "no signal in last 7 days" flag
  closes: number[]; volumes: number[]; times: number[]; // for detail chart
}
```

### `src/server/signal-study/signals.ts`
- Export `SIGNALS: SignalDef[]`.
- `interface SignalDef { key; labelVi; labelEn; cooldownBars; detect(ctx): boolean }`
- `detect(ctx)` receives precomputed indicator series + bar index `i`; uses only `[0..i]`.
- Precompute indicators ONCE per study (not per bar): pass a `precomputed` bundle
  (ema20, ema50, rsi14, bb, vsma20, macd, psar, dmi, stochRsi) into ctx.
- Textbook defs (tunable consts at top):
  - vol-breakout: `vol[i] > 1.8 * vsma20[i]`
  - rsi-oversold: `rsi[i] < 30 && rsi[i-1] >= 30` (cross-in)
  - drop15-20: `close[i] <= close[i-20] * 0.85`
  - drop15-ma20: `close[i] <= ma20[i] * 0.85`
  - bb-open: `bbWidth[i] > bbWidth[i-1] * k && bbWidth[i] > prevAvgWidth` (expansion)
  - uptrend: `close[i] > ema50[i] && ema50[i] > ema50[i-1]`
  - sar-x-macd: `psarFlip up at i && macd.histogram[i] > 0`
  - dmi-wave: `plusDI cross above minusDI && adx[i] > 20`
  - up-macd: `close[i] > close[i-1] && macd.histogram[i] > 0 && histogram rising`
  - up-stochrsi: `close[i] > close[i-1] && stochRsi.k cross above stochRsi.d (from <20)`

### `src/server/signal-study/study-engine.ts`
- `runSignalStudy(symbol, candles): StudyResult`
- Steps:
  1. precompute all indicator series.
  2. for each signal: walk bars from warmup; on `detect && (i - lastFire) >= cooldownBars` → push event idx, set lastFire.
  3. for each event idx `e`, each horizon `h`: if `e+h < len` → `ret = (close[e+h]-close[e]) / close[e] * 100`.
  4. aggregate avg + win-prob per horizon; bucket by `year(times[e])`.
  5. build detail per signal; conclusion = signal+horizon with max avgOverall (short = best ≤5d, long = best ≥60d); recent7d = any event in last 7 calendar days.

## Todo
- [ ] types.ts
- [ ] signals.ts (10 detectors + precompute bundle)
- [ ] study-engine.ts
- [ ] tsc compile clean

## Success criteria
- Matrix shape: 10 rows × 6 horizons, null where events < min-sample (e.g. < 5).
- No lookahead in detection (verified: detect reads only [0..i]).
- Per-year sums reconcile with overall (weighted by event count).

## Risks
- Overlap inflation → cooldown handles. Default cooldown ~ horizon-agnostic small (e.g. 3 bars); per-signal override.
- Min-sample threshold: render null/"—" like TCBS 2026 row, don't fabricate.
