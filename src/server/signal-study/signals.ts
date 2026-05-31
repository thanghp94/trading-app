import type { Candle } from "../../shared/types.js";
import { ema } from "../../shared/indicators/ema.js";
import { rsi } from "../../shared/indicators/rsi.js";
import { bollinger } from "../../shared/indicators/bollinger.js";
import { volumeSma } from "../../shared/indicators/impulse-detector.js";
import { macd, type Macd } from "../../shared/indicators/macd.js";
import {
  parabolicSar,
  type ParabolicSar,
} from "../../shared/indicators/parabolic-sar.js";
import { dmi, type Dmi } from "../../shared/indicators/dmi.js";
import {
  stochasticRsi,
  type StochasticRsi,
} from "../../shared/indicators/stochastic-rsi.js";

// Tunable thresholds for the textbook signal definitions.
const VOL_MULT = 1.8;
const RSI_OVERSOLD = 30;
const DROP_PCT = 0.85; // −15%
const ADX_TREND = 20;
const STOCH_OVERSOLD = 20;

/** Indicator series computed once per study and shared across detectors. */
export interface Precomputed {
  candles: Candle[];
  closes: number[];
  ema50: number[];
  ma20: number[];
  rsi14: number[];
  bbWidth: number[];
  bbWidthSma: number[];
  vsma20: number[];
  macd: Macd;
  psar: ParabolicSar;
  dmi: Dmi;
  stochRsi: StochasticRsi;
}

export interface SignalDef {
  key: string;
  labelVi: string;
  labelEn: string;
  /** Bars to wait before the same signal can fire again (dedupe overlap). */
  cooldownBars: number;
  /** Fires at bar `i` using only data up to `i` (no lookahead). */
  detect: (p: Precomputed, i: number) => boolean;
}

function rollingSma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const q: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      q.length = 0;
      sum = 0;
      continue;
    }
    q.push(v);
    sum += v;
    if (q.length > period) sum -= q.shift() as number;
    if (q.length === period) out[i] = sum / period;
  }
  return out;
}

export function precompute(candles: Candle[]): Precomputed {
  const bb = bollinger(candles, 20, 2);
  const bbWidth = candles.map((_, i) =>
    Number.isFinite(bb.middle[i]) && bb.middle[i] !== 0
      ? (bb.upper[i] - bb.lower[i]) / bb.middle[i]
      : NaN,
  );
  return {
    candles,
    closes: candles.map((c) => c.close),
    ema50: ema(candles, 50),
    ma20: bb.middle, // SMA(20) is the Bollinger midline
    rsi14: rsi(candles, 14),
    bbWidth,
    bbWidthSma: rollingSma(bbWidth, 20),
    vsma20: volumeSma(candles, 20),
    macd: macd(candles),
    psar: parabolicSar(candles),
    dmi: dmi(candles, 14),
    stochRsi: stochasticRsi(candles),
  };
}

const fin = Number.isFinite;

/** 10 TCBS buy signals, ordered to match the TCBS table. */
export const SIGNALS: SignalDef[] = [
  {
    key: "vol-breakout",
    labelVi: "Bùng nổ khối lượng",
    labelEn: "Volume breakout",
    cooldownBars: 5,
    detect: (p, i) =>
      fin(p.vsma20[i]) &&
      p.vsma20[i] > 0 &&
      p.candles[i].volume > VOL_MULT * p.vsma20[i],
  },
  {
    key: "rsi-oversold",
    labelVi: "RSI quá bán",
    labelEn: "RSI oversold",
    cooldownBars: 5,
    detect: (p, i) =>
      fin(p.rsi14[i]) &&
      fin(p.rsi14[i - 1]) &&
      p.rsi14[i] < RSI_OVERSOLD &&
      p.rsi14[i - 1] >= RSI_OVERSOLD,
  },
  {
    key: "drop15-20d",
    labelVi: "Giá giảm 15% trong 20 phiên",
    labelEn: "Price −15% in 20 sessions",
    cooldownBars: 20,
    detect: (p, i) => i >= 20 && p.closes[i] <= p.closes[i - 20] * DROP_PCT,
  },
  {
    key: "drop15-ma20",
    labelVi: "Giá giảm 15% so với MA20",
    labelEn: "Price −15% vs MA20",
    cooldownBars: 20,
    detect: (p, i) => fin(p.ma20[i]) && p.closes[i] <= p.ma20[i] * DROP_PCT,
  },
  {
    key: "sar-macd",
    labelVi: "SAR x MACD Histogram",
    labelEn: "SAR × MACD Histogram",
    cooldownBars: 1,
    detect: (p, i) =>
      i >= 1 &&
      p.psar.trend[i] === "up" &&
      p.psar.trend[i - 1] === "down" &&
      fin(p.macd.histogram[i]) &&
      p.macd.histogram[i] > 0,
  },
  {
    key: "uptrend",
    labelVi: "Uptrend",
    labelEn: "Uptrend",
    cooldownBars: 10,
    detect: (p, i) =>
      fin(p.ema50[i]) &&
      fin(p.ema50[i - 1]) &&
      p.closes[i] > p.ema50[i] &&
      p.ema50[i] > p.ema50[i - 1],
  },
  {
    key: "bb-expansion",
    labelVi: "Mở Band Bollinger",
    labelEn: "Bollinger band expansion",
    cooldownBars: 5,
    detect: (p, i) =>
      fin(p.bbWidth[i]) &&
      fin(p.bbWidth[i - 1]) &&
      fin(p.bbWidthSma[i]) &&
      p.bbWidth[i] > p.bbWidthSma[i] &&
      p.bbWidth[i] > p.bbWidth[i - 1],
  },
  {
    key: "dmi-wave",
    labelVi: "Lướt sóng với DMI",
    labelEn: "Wave-surf with DMI",
    cooldownBars: 5,
    detect: (p, i) =>
      fin(p.dmi.adx[i]) &&
      p.dmi.adx[i] > ADX_TREND &&
      p.dmi.plusDI[i] > p.dmi.minusDI[i] &&
      p.dmi.plusDI[i - 1] <= p.dmi.minusDI[i - 1],
  },
  {
    key: "up-macd",
    labelVi: "Giá tăng và MACD Histogram",
    labelEn: "Price up & MACD Histogram",
    cooldownBars: 3,
    detect: (p, i) =>
      i >= 1 &&
      p.closes[i] > p.closes[i - 1] &&
      fin(p.macd.histogram[i]) &&
      fin(p.macd.histogram[i - 1]) &&
      p.macd.histogram[i] > 0 &&
      p.macd.histogram[i] > p.macd.histogram[i - 1],
  },
  {
    key: "up-stochrsi",
    labelVi: "Giá tăng và Stochastic RSI",
    labelEn: "Price up & Stochastic RSI",
    cooldownBars: 3,
    detect: (p, i) =>
      i >= 1 &&
      p.closes[i] > p.closes[i - 1] &&
      fin(p.stochRsi.k[i]) &&
      fin(p.stochRsi.d[i]) &&
      fin(p.stochRsi.k[i - 1]) &&
      fin(p.stochRsi.d[i - 1]) &&
      p.stochRsi.k[i] > p.stochRsi.d[i] &&
      p.stochRsi.k[i - 1] <= p.stochRsi.d[i - 1] &&
      p.stochRsi.k[i - 1] < STOCH_OVERSOLD,
  },
];
