export const HORIZONS = [3, 5, 10, 20, 60, 180] as const;
export type Horizon = (typeof HORIZONS)[number];

/** Minimum events required before a horizon cell reports a number (else null). */
export const MIN_SAMPLE = 5;

export type ByHorizon = Record<Horizon, number | null>;

export interface SignalRow {
  key: string;
  labelVi: string;
  labelEn: string;
  /** Mean forward return %, per holding horizon. */
  avgByHorizon: ByHorizon;
  /** Win probability % (forward return > 0), per holding horizon. */
  winByHorizon: ByHorizon;
  /** Mean of the row's non-null horizon averages ("Trung bình" column). */
  avgOverall: number | null;
  /** Total events that fired (after cooldown dedupe). */
  events: number;
}

export interface PerYear {
  year: number;
  byHorizon: ByHorizon;
  overall: number | null;
}

export interface SignalDetail {
  key: string;
  labelVi: string;
  /** Bar indices where the signal fired (for chart markers). */
  eventIdx: number[];
  avgByHorizon: ByHorizon;
  winByHorizon: ByHorizon;
  /** Horizon with the highest mean return. */
  optimalAvgHorizon: Horizon | null;
  /** Horizon with the highest win probability. */
  optimalWinHorizon: Horizon | null;
  /** Best/worst single (year, horizon) avg-return cell. */
  bestPeriod: { horizon: Horizon; year: number; value: number } | null;
  worstPeriod: { horizon: Horizon; year: number; value: number } | null;
  /** Win/breakeven/loss split at the optimal-avg horizon. */
  donut: { win: number; breakeven: number; loss: number; total: number };
  perYearAvg: PerYear[];
  perYearWin: PerYear[];
}

export interface StudyConclusion {
  shortTerm?: { key: string; labelVi: string; horizon: Horizon; value: number };
  longTerm?: { key: string; labelVi: string; horizon: Horizon; value: number };
  /** True when at least one signal fired in the last 7 calendar days. */
  recent7d: boolean;
}

export interface StudyResult {
  symbol: string;
  bars: number;
  fromTime: number;
  toTime: number;
  rows: SignalRow[];
  details: Record<string, SignalDetail>;
  conclusion: StudyConclusion;
  /** Aligned series for the detail chart. */
  closes: number[];
  volumes: number[];
  times: number[];
}

export function emptyByHorizon(): ByHorizon {
  return { 3: null, 5: null, 10: null, 20: null, 60: null, 180: null };
}
