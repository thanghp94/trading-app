import type { Candle } from "../../shared/types.js";
import {
  HORIZONS,
  MIN_SAMPLE,
  emptyByHorizon,
  type ByHorizon,
  type Horizon,
  type PerYear,
  type SignalDetail,
  type SignalRow,
  type StudyConclusion,
  type StudyResult,
} from "./types.js";
import { SIGNALS, precompute, type SignalDef } from "./signals.js";

const mean = (xs: number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length;
const yearOf = (unixSec: number): number =>
  new Date(unixSec * 1000).getUTCFullYear();

interface EventReturns {
  idx: number;
  year: number;
  ret: Partial<Record<Horizon, number>>;
}

function meanOfRec(rec: ByHorizon): number | null {
  const vals = HORIZONS.map((h) => rec[h]).filter(
    (v): v is number => v !== null,
  );
  return vals.length ? mean(vals) : null;
}

/**
 * Fixed-horizon forward-return event study. For every signal, finds each
 * historical fire (cooldown-deduped) and measures close-to-close return at each
 * holding horizon, then aggregates mean return + win probability, broken down
 * by year. Detection reads only bars up to `i` — no lookahead.
 */
export function runSignalStudy(symbol: string, candles: Candle[]): StudyResult {
  const p = precompute(candles);
  const len = candles.length;
  const closes = p.closes;
  const times = candles.map((c) => c.time);
  const toTime = times[len - 1] ?? 0;

  const rows: SignalRow[] = [];
  const details: Record<string, SignalDetail> = {};
  let recent7d = false;

  for (const sig of SIGNALS) {
    const eventIdx: number[] = [];
    let lastFire = -Infinity;
    for (let i = 1; i < len; i += 1) {
      if (!sig.detect(p, i)) continue;
      if (i - lastFire < sig.cooldownBars) continue;
      lastFire = i;
      eventIdx.push(i);
    }
    if (
      eventIdx.length > 0 &&
      times[eventIdx[eventIdx.length - 1]] >= toTime - 7 * 86400
    ) {
      recent7d = true;
    }

    const events: EventReturns[] = eventIdx.map((e) => {
      const ret: Partial<Record<Horizon, number>> = {};
      for (const h of HORIZONS) {
        if (e + h < len)
          ret[h] = ((closes[e + h] - closes[e]) / closes[e]) * 100;
      }
      return { idx: e, year: yearOf(times[e]), ret };
    });

    const avgByHorizon = emptyByHorizon();
    const winByHorizon = emptyByHorizon();
    for (const h of HORIZONS) {
      const vals = events
        .map((ev) => ev.ret[h])
        .filter((v): v is number => v !== undefined);
      if (vals.length >= MIN_SAMPLE) {
        avgByHorizon[h] = mean(vals);
        winByHorizon[h] =
          (vals.filter((v) => v > 0).length / vals.length) * 100;
      }
    }

    rows.push({
      key: sig.key,
      labelVi: sig.labelVi,
      labelEn: sig.labelEn,
      avgByHorizon,
      winByHorizon,
      avgOverall: meanOfRec(avgByHorizon),
      events: eventIdx.length,
    });
    details[sig.key] = buildDetail(
      sig,
      eventIdx,
      events,
      avgByHorizon,
      winByHorizon,
    );
  }

  return {
    symbol,
    bars: len,
    fromTime: times[0] ?? 0,
    toTime,
    rows,
    details,
    conclusion: buildConclusion(rows, recent7d),
    closes,
    volumes: candles.map((c) => c.volume),
    times,
  };
}

function buildDetail(
  sig: SignalDef,
  eventIdx: number[],
  events: EventReturns[],
  avgByHorizon: ByHorizon,
  winByHorizon: ByHorizon,
): SignalDetail {
  let optimalAvgHorizon: Horizon | null = null;
  let optimalWinHorizon: Horizon | null = null;
  let bestAvg = -Infinity;
  let bestWin = -Infinity;
  for (const h of HORIZONS) {
    const a = avgByHorizon[h];
    const w = winByHorizon[h];
    if (a !== null && a > bestAvg) {
      bestAvg = a;
      optimalAvgHorizon = h;
    }
    if (w !== null && w > bestWin) {
      bestWin = w;
      optimalWinHorizon = h;
    }
  }

  const years = [...new Set(events.map((e) => e.year))].sort((a, b) => a - b);
  const perYearAvg: PerYear[] = [];
  const perYearWin: PerYear[] = [];
  let bestPeriod: SignalDetail["bestPeriod"] = null;
  let worstPeriod: SignalDetail["worstPeriod"] = null;

  for (const year of years) {
    const yEvents = events.filter((e) => e.year === year);
    const avgRec = emptyByHorizon();
    const winRec = emptyByHorizon();
    for (const h of HORIZONS) {
      const vals = yEvents
        .map((e) => e.ret[h])
        .filter((v): v is number => v !== undefined);
      if (vals.length === 0) continue;
      const avg = mean(vals);
      avgRec[h] = avg;
      winRec[h] = (vals.filter((v) => v > 0).length / vals.length) * 100;
      if (bestPeriod === null || avg > bestPeriod.value)
        bestPeriod = { horizon: h, year, value: avg };
      if (worstPeriod === null || avg < worstPeriod.value)
        worstPeriod = { horizon: h, year, value: avg };
    }
    perYearAvg.push({ year, byHorizon: avgRec, overall: meanOfRec(avgRec) });
    perYearWin.push({ year, byHorizon: winRec, overall: meanOfRec(winRec) });
  }

  const donut = { win: 0, breakeven: 0, loss: 0, total: 0 };
  if (optimalAvgHorizon !== null) {
    for (const e of events) {
      const v = e.ret[optimalAvgHorizon];
      if (v === undefined) continue;
      donut.total += 1;
      if (v > 0) donut.win += 1;
      else if (v < 0) donut.loss += 1;
      else donut.breakeven += 1;
    }
  }

  return {
    key: sig.key,
    labelVi: sig.labelVi,
    eventIdx,
    avgByHorizon,
    winByHorizon,
    optimalAvgHorizon,
    optimalWinHorizon,
    bestPeriod,
    worstPeriod,
    donut,
    perYearAvg,
    perYearWin,
  };
}

function buildConclusion(
  rows: SignalRow[],
  recent7d: boolean,
): StudyConclusion {
  const SHORT: Horizon[] = [3, 5];
  const LONG: Horizon[] = [60, 180];
  let shortTerm: StudyConclusion["shortTerm"];
  let longTerm: StudyConclusion["longTerm"];
  let bestShort = -Infinity;
  let bestLong = -Infinity;
  for (const r of rows) {
    for (const h of SHORT) {
      const v = r.avgByHorizon[h];
      if (v !== null && v > bestShort) {
        bestShort = v;
        shortTerm = { key: r.key, labelVi: r.labelVi, horizon: h, value: v };
      }
    }
    for (const h of LONG) {
      const v = r.avgByHorizon[h];
      if (v !== null && v > bestLong) {
        bestLong = v;
        longTerm = { key: r.key, labelVi: r.labelVi, horizon: h, value: v };
      }
    }
  }
  return { shortTerm, longTerm, recent7d };
}
