import type { Candle, Timeframe } from '../../shared/types.js';
import { runBacktest, type BacktestRequest, type BacktestResult } from './backtest-engine.js';

export interface SweepAxis {
  /** Name of `BacktestRequest` field to vary. */
  key: keyof BacktestRequest;
  /** Discrete values to try. */
  values: Array<number | boolean | string>;
}

export interface SweepRequest {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  /** Base config — fixed across every cell of the sweep. */
  base: Partial<BacktestRequest>;
  /** 1–3 axes to sweep. More than 3 risks combinatorial explosion. */
  axes: SweepAxis[];
  /**
   * Walk-forward split. When set, runs each cell on training window
   * `[0, splitFraction*N)` and again on test window `[splitFraction*N, N)`.
   * Returns both stats so user can compare in-sample vs out-of-sample.
   * Default null = no split, single run.
   */
  walkForwardSplit?: number | null;
}

export interface SweepCell {
  /** Axis-key → chosen value for this cell. */
  params: Record<string, number | boolean | string>;
  inSample: BacktestResult['stats'] | null;
  outOfSample: BacktestResult['stats'] | null;
  /** Single-run stats when walkForwardSplit is null. */
  full: BacktestResult['stats'] | null;
}

export interface SweepResponse {
  axes: SweepAxis[];
  cells: SweepCell[];
  walkForwardSplit: number | null;
  /** Best cell by out-of-sample sumR (or full sumR when no split). */
  bestCellIdx: number;
}

/**
 * Grid-search over up to 3 axes. For each combination, optionally splits
 * the candle history into train/test to expose overfit configs.
 *
 * Hard-caps total cell count at 64 to keep response time + memory bounded.
 * Caller is responsible for keeping `axes[i].values.length` small.
 */
export function runSweep(req: SweepRequest): SweepResponse {
  if (req.axes.length === 0) throw new Error('At least 1 axis required');
  if (req.axes.length > 3) throw new Error('Max 3 axes');
  const totalCells = req.axes.reduce((n, a) => n * a.values.length, 1);
  if (totalCells > 64) throw new Error(`${totalCells} cells > 64 limit. Reduce axes or values.`);

  const combos = cartesian(req.axes);
  const split = req.walkForwardSplit ?? null;
  const splitIdx = split != null ? Math.floor(req.candles.length * split) : -1;
  const trainCandles = splitIdx > 0 ? req.candles.slice(0, splitIdx) : [];
  const testCandles = splitIdx > 0 ? req.candles.slice(splitIdx) : [];

  const cells: SweepCell[] = combos.map((params) => {
    const config: Partial<BacktestRequest> = { ...req.base, ...params };
    if (split == null) {
      const result = runBacktest({
        ...(config as BacktestRequest),
        symbol: req.symbol,
        timeframe: req.timeframe,
        candles: req.candles,
      });
      return { params, inSample: null, outOfSample: null, full: result.stats };
    }
    const inS = trainCandles.length >= 50
      ? runBacktest({ ...(config as BacktestRequest), symbol: req.symbol, timeframe: req.timeframe, candles: trainCandles }).stats
      : null;
    const oos = testCandles.length >= 50
      ? runBacktest({ ...(config as BacktestRequest), symbol: req.symbol, timeframe: req.timeframe, candles: testCandles }).stats
      : null;
    return { params, inSample: inS, outOfSample: oos, full: null };
  });

  // Best = highest OOS sumR (penalize overfits), or full sumR when no split.
  let bestCellIdx = 0;
  let bestScore = -Infinity;
  cells.forEach((c, i) => {
    const score = c.outOfSample?.sumR ?? c.full?.sumR ?? -Infinity;
    if (score > bestScore) { bestScore = score; bestCellIdx = i; }
  });

  return { axes: req.axes, cells, walkForwardSplit: split, bestCellIdx };
}

function cartesian(axes: SweepAxis[]): Array<Record<string, number | boolean | string>> {
  if (axes.length === 0) return [{}];
  const [head, ...rest] = axes;
  const restCombos = cartesian(rest);
  const out: Array<Record<string, number | boolean | string>> = [];
  for (const v of head.values) {
    for (const c of restCombos) {
      out.push({ [head.key as string]: v, ...c });
    }
  }
  return out;
}
