// Blackbox domain types. See plans/260528-1801-qmv-blackbox-screener-system/blackbox-math.md.

/** QMV cycle windows in trading days: T+, week, 2wk, month, quarter, year. */
export const CYCLES = [3, 5, 10, 20, 50, 200] as const;
export type Cycle = (typeof CYCLES)[number];

/** [PROXY] one day of estimated box flow, derived from OHLCV. */
export interface DailyFlow {
  /** Bar time, unix seconds. */
  time: number;
  close: number;
  volume: number;
  /** Money into box that day (cầu), VND-value units. */
  dm: number;
  /** Value distributed out that day (cung), same units. */
  ds: number;
}

/** Money state of the box (BB-Status). */
export type BBStatus = "tien-khoe" | "bao-hoa" | "tien-yeu" | "duy-tri";

/** Demand cycle state (XH Cầu / Chu kỳ cung cầu). */
export type XHCau = "cau-khoe" | "bao-hoa" | "cau-yeu" | "duy-tri";

/** Per-cycle normalized oscillator + raw windowed series. */
export interface CycleData {
  /** Raw trailing-sum money-in over the cycle. */
  dm: number[];
  /** Raw trailing-sum value-out over the cycle. */
  ds: number[];
  /** Tốc độ = dm − ds (net, same units). */
  speed: number[];
  /** CHDMx: dm normalized 0-100 over trailing 50 sessions. */
  chdm: number[];
  /** CHDSx: ds normalized 0-100 over trailing 50 sessions. */
  chds: number[];
}

/** Boolean signals at the latest bar. */
export interface BlackboxSignals {
  uonLen20: boolean;
  uonLen30: boolean;
  uonXuong70: boolean;
  uonXuong80: boolean;
  tienVaoHomNay: boolean;
  tienVao2Phien: boolean;
  tienVao3Phien: boolean;
  tienRaHomNay: boolean;
  tienRa2Phien: boolean;
  tienRa3Phien: boolean;
  daoChieuTangTplus: boolean;
  daoChieuGiamTplus: boolean;
  /** Cơ hội T+ / T++ / theo sóng (escalating confluence of Uốn lên). */
  coHoiTplus: boolean;
  coHoiTplusplus: boolean;
  coHoiTheoSong: boolean;
}

/** Full blackbox result for one symbol. */
export interface BlackboxResult {
  symbol: string;
  /** Per-bar times (unix sec), aligned across all series. */
  times: number[];
  /** Raw cumulative box level (store this; derive tmc on read). */
  boxRaw: number[];
  /** TMC: boxRaw anchor-normalized 0..1. */
  tmc: number[];
  tma20: number[];
  tma50: number[];
  cycles: Record<Cycle, CycleData>;
  /** DSPI: demand−supply cycle, −1..+1 (0 neutral). */
  dspi: number[];
  bbStatus: BBStatus;
  xhCau: XHCau;
  signals: BlackboxSignals;
  /** Marks proxy-derived (not real tick data). */
  proxy: true;
}
