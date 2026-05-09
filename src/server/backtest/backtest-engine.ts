import type { Alert, Candle, Timeframe } from '../../shared/types.js';
import { atr } from '../../shared/indicators/atr.js';
import { computeZones } from '../../shared/indicators/sr-zone-tracker.js';
import { computeWaves } from '../../shared/indicators/wave-counter.js';
import { checkMtf, type MtfCheck } from '../../shared/indicators/mtf.js';
import { ALL_RULES } from '../alerts/rules/index.js';
import type { RuleContext } from '../alerts/rule-types.js';

export type SlMode = 'pct' | 'trigger-wick';
export type TpMode = 'rr' | 'next-resistance';

export interface BacktestRequest {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];

  /**
   * SL placement mode.
   *   - 'pct'           : SL distance = entry × slPct (legacy)
   *   - 'trigger-wick'  : SL = impulse-trigger candle's wick - buffer
   *                       (matches the teacher's "below the strong consistent candle" rule)
   * Defaults to 'trigger-wick' since it matches the documented technique.
   */
  slMode?: SlMode;
  /** Used when slMode='pct'. Default 0.5%. */
  slPct?: number;
  /** Used when slMode='trigger-wick'. Buffer in ATR units. Default 0.1×ATR. */
  slBufferAtr?: number;

  /**
   * TP placement mode.
   *   - 'rr'              : TP = entry + rrTarget × |entry-SL| (legacy)
   *   - 'next-resistance' : TP = nearest active S/R zone in trade direction - buffer
   *                         (matches "just below the next resistance"). Falls back
   *                         to 'rr' with rrTarget when no zone is found.
   */
  tpMode?: TpMode;
  rrTarget?: number;
  /** Used when tpMode='next-resistance'. Buffer in ATR units. Default 0.1. */
  tpBufferAtr?: number;

  /** Time-stop. Default 30 bars. */
  maxBars?: number;
  /** Risk-per-trade as % of balance. Default 1%. */
  riskPct?: number;
  /** Starting equity. Default 10000. */
  startingBalance?: number;

  /**
   * When true, only ★ preferred (wave-5-entry) alerts spawn trades.
   * Wave-3, zone-touch, and pattern alerts are ignored. Default false.
   */
  preferredOnly?: boolean;

  /**
   * Multi-timeframe trend gating. When true, an alert only spawns a trade
   * if the higher-timeframe EMA(50) agrees with the trade direction.
   * Encodes "trade with the higher-TF trend." Default false.
   */
  mtfTrendAlign?: boolean;

  /**
   * Multi-timeframe zone confluence gating. When true, an alert only spawns
   * a trade if entry price sits inside an active HTF zone in the trade
   * direction (support for bull, resistance for bear). Default false.
   */
  mtfZoneConfluence?: boolean;
}

export type BacktestOutcome = 'win' | 'loss' | 'breakeven' | 'time-stop';

export interface BacktestTrade {
  alert: Alert;
  entryIdx: number;
  exitIdx: number;
  entry: number;
  sl: number;
  tp: number;
  exit: number;
  rMultiple: number;
  outcome: BacktestOutcome;
  pnlAbs: number;
  balanceAfter: number;
  /** Why this SL/TP was chosen — for transparency in result inspection. */
  slReason: string;
  tpReason: string;
  /** MTF check at entry time. Always populated, even when gating was off. */
  mtf: MtfCheck;
}

export interface BacktestResult {
  symbol: string;
  timeframe: Timeframe;
  trades: BacktestTrade[];
  equity: Array<{ time: number; balance: number }>;
  stats: {
    total: number;
    wins: number;
    losses: number;
    breakeven: number;
    timeStops: number;
    winRate: number;
    avgR: number;
    bestR: number;
    worstR: number;
    sumR: number;
    maxDrawdownPct: number;
    finalBalance: number;
    pnlPct: number;
  };
}

/**
 * Walks historical candles bar-by-bar, replays the same rule evaluator that
 * runs in production, and simulates a trade for every fired alert using the
 * configured SL/TP modes.
 *
 * SL/TP placement matches the documented technique by default:
 *   - SL = LOW (bull) or HIGH (bear) of the impulse-trigger candle, minus
 *     (or plus) a small ATR buffer. This is the "below the strong consistent
 *     candle" rule.
 *   - TP = nearest active S/R zone in trade direction, minus (or plus) a
 *     small ATR buffer. Falls back to R:R-based when no zone is found.
 *
 * Conservative tie-break: if both SL and TP are within the same bar's range,
 * assume SL hit first (worst case).
 */
export function runBacktest(req: BacktestRequest): BacktestResult {
  const slMode: SlMode = req.slMode ?? 'trigger-wick';
  const tpMode: TpMode = req.tpMode ?? 'next-resistance';
  const slPct = req.slPct ?? 0.005;
  const slBufferAtr = req.slBufferAtr ?? 0.1;
  const rrTarget = req.rrTarget ?? 2;
  const tpBufferAtr = req.tpBufferAtr ?? 0.1;
  const maxBars = req.maxBars ?? 30;
  const riskPct = req.riskPct ?? 1;
  const startingBalance = req.startingBalance ?? 10000;
  const preferredOnly = req.preferredOnly ?? false;
  const mtfTrendAlign = req.mtfTrendAlign ?? false;
  const mtfZoneConfluence = req.mtfZoneConfluence ?? false;

  const alerts = replayAlerts(req.symbol, req.timeframe, req.candles, preferredOnly);
  const atrSeries = atr(req.candles, 14);

  const trades: BacktestTrade[] = [];
  let balance = startingBalance;
  const equity: Array<{ time: number; balance: number }> = [
    { time: req.candles[0]?.time ?? 0, balance },
  ];
  let peakBalance = startingBalance;
  let maxDrawdownPct = 0;

  for (const alert of alerts) {
    const entryIdx = req.candles.findIndex((c) => c.time === alert.time);
    if (entryIdx < 0) continue;
    const entry = req.candles[entryIdx].close;
    const isBull = alert.direction === 'bull';
    const a = atrSeries[entryIdx];
    if (!Number.isFinite(a) || a <= 0) continue;

    // ─── MTF check (always run; used for tagging + optional gating) ────
    const mtf = checkMtf({
      baseCandles: req.candles,
      baseTf: req.timeframe,
      entryIdx,
      direction: alert.direction,
    });
    if (mtfTrendAlign && mtf.trend === 'mismatch') continue;
    if (mtfZoneConfluence && mtf.zone !== 'aligned') continue;

    // ─── SL ────────────────────────────────────────────────────────────
    let sl = isBull ? entry - entry * slPct : entry + entry * slPct;
    let slReason = `pct=${(slPct * 100).toFixed(2)}%`;
    if (slMode === 'trigger-wick') {
      // Wave alerts carry meta.point0 = the impulse-trigger candle.
      const point0 = (alert.meta?.point0 ?? alert.meta?.point2 ?? alert.meta?.point4) as
        | { index?: number; time?: number; price?: number }
        | undefined;
      const triggerIdx =
        point0?.index != null
          ? point0.index
          : alert.meta?.point0
            ? req.candles.findIndex((c) => c.time === (alert.meta!.point0 as { time: number }).time)
            : -1;
      const triggerBar = triggerIdx >= 0 ? req.candles[triggerIdx] : undefined;
      if (triggerBar) {
        const buffer = a * slBufferAtr;
        sl = isBull ? triggerBar.low - buffer : triggerBar.high + buffer;
        slReason = `trigger-wick @ idx=${triggerIdx} ${isBull ? 'low' : 'high'}=${
          isBull ? triggerBar.low : triggerBar.high
        } - ${buffer.toFixed(4)} buffer`;
      }
      // No trigger info available (zone-touch, pattern-formed) → keep pct fallback.
    }
    // Sanity: if SL ended up on the wrong side of entry (shouldn't happen but
    // defensive), fall back to pct.
    if ((isBull && sl >= entry) || (!isBull && sl <= entry)) {
      sl = isBull ? entry - entry * slPct : entry + entry * slPct;
      slReason += ' [reverted-to-pct]';
    }

    // ─── TP ────────────────────────────────────────────────────────────
    const slDist = Math.abs(entry - sl);
    let tp = isBull ? entry + slDist * rrTarget : entry - slDist * rrTarget;
    let tpReason = `rr=${rrTarget}`;
    if (tpMode === 'next-resistance') {
      // Compute zones using ONLY the history available at entry — no peeking ahead.
      const slice = req.candles.slice(0, entryIdx + 1);
      const zones = computeZones(slice);
      const candidate = zones
        .filter((z) => z.state === 'active')
        .filter((z) => (isBull ? z.bottom > entry : z.top < entry))
        .sort((a1, b) => (isBull ? a1.bottom - b.bottom : b.top - a1.top))[0];
      if (candidate) {
        const buffer = a * tpBufferAtr;
        tp = isBull ? candidate.bottom - buffer : candidate.top + buffer;
        tpReason = `next-${isBull ? 'resistance' : 'support'} @ ${
          isBull ? candidate.bottom : candidate.top
        } - ${buffer.toFixed(4)} buffer`;
      } else {
        tpReason = `next-resistance not found, fallback rr=${rrTarget}`;
      }
    }
    // Sanity: TP must be on the profit side AND past the entry by some minimum.
    if ((isBull && tp <= entry) || (!isBull && tp >= entry)) {
      tp = isBull ? entry + slDist * rrTarget : entry - slDist * rrTarget;
      tpReason += ' [reverted-to-rr]';
    }

    // ─── Walk forward to outcome ────────────────────────────────────────
    let exitIdx = entryIdx;
    let exit = entry;
    let rMultiple = 0;
    let outcome: BacktestOutcome = 'time-stop';

    for (let i = entryIdx + 1; i < req.candles.length && i <= entryIdx + maxBars; i += 1) {
      const bar = req.candles[i];
      const slHit = isBull ? bar.low <= sl : bar.high >= sl;
      const tpHit = isBull ? bar.high >= tp : bar.low <= tp;
      if (slHit && tpHit) {
        exit = sl;
        exitIdx = i;
        outcome = 'loss';
        rMultiple = -1;
        break;
      }
      if (slHit) {
        exit = sl;
        exitIdx = i;
        outcome = 'loss';
        rMultiple = -1;
        break;
      }
      if (tpHit) {
        exit = tp;
        exitIdx = i;
        outcome = 'win';
        const reward = isBull ? exit - entry : entry - exit;
        rMultiple = reward / slDist;
        break;
      }
      if (i === entryIdx + maxBars || i === req.candles.length - 1) {
        exit = bar.close;
        exitIdx = i;
        const r = (isBull ? exit - entry : entry - exit) / slDist;
        rMultiple = r;
        outcome = Math.abs(r) < 0.05 ? 'breakeven' : 'time-stop';
      }
    }

    const riskAmount = balance * (riskPct / 100);
    const pnlAbs = rMultiple * riskAmount;
    balance += pnlAbs;
    if (balance > peakBalance) peakBalance = balance;
    const dd = ((peakBalance - balance) / peakBalance) * 100;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;

    trades.push({
      alert, entryIdx, exitIdx, entry, sl, tp, exit, rMultiple, outcome, pnlAbs,
      balanceAfter: balance, slReason, tpReason, mtf,
    });
    equity.push({ time: req.candles[exitIdx].time, balance });
  }

  const wins = trades.filter((t) => t.outcome === 'win').length;
  const losses = trades.filter((t) => t.outcome === 'loss').length;
  const breakeven = trades.filter((t) => t.outcome === 'breakeven').length;
  const timeStops = trades.filter((t) => t.outcome === 'time-stop').length;
  const rs = trades.map((t) => t.rMultiple);
  const sumR = rs.reduce((a, b) => a + b, 0);
  const avgR = trades.length > 0 ? sumR / trades.length : 0;
  const bestR = rs.length > 0 ? Math.max(...rs) : 0;
  const worstR = rs.length > 0 ? Math.min(...rs) : 0;
  const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;

  return {
    symbol: req.symbol,
    timeframe: req.timeframe,
    trades,
    equity,
    stats: {
      total: trades.length, wins, losses, breakeven, timeStops, winRate,
      avgR, bestR, worstR, sumR, maxDrawdownPct, finalBalance: balance,
      pnlPct: ((balance - startingBalance) / startingBalance) * 100,
    },
  };
}

function replayAlerts(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
  preferredOnly: boolean,
): Alert[] {
  const out: Alert[] = [];
  const lastFiredBar = new Map<string, number>();
  let prevContext: Omit<RuleContext, 'prev'> | undefined;
  const stride = candleStrideSec(candles);

  for (let i = 50; i < candles.length; i += 1) {
    const slice = candles.slice(0, i + 1);
    const candle = slice[slice.length - 1];
    if (!candle.closed) continue;
    const zones = computeZones(slice);
    const waves = computeWaves(slice);
    const ctx: RuleContext = {
      symbol, timeframe, candles: slice, candle, zones, waves, prev: prevContext,
    };
    for (const rule of ALL_RULES) {
      if (preferredOnly && rule.key !== 'wave-5-entry') continue;
      const fired = rule.evaluate(ctx);
      if (!fired) continue;
      const cooldownKey = `${rule.key}:${symbol}:${timeframe}`;
      const lastBar = lastFiredBar.get(cooldownKey) ?? -Infinity;
      const barsSince = (candle.time - lastBar) / stride;
      if (barsSince < rule.cooldownBars) continue;
      lastFiredBar.set(cooldownKey, candle.time);
      out.push({
        id: `bt:${cooldownKey}:${candle.time}`,
        symbol, timeframe, time: candle.time, price: candle.close,
        ...fired,
      });
    }
    const { prev: _, ...rest } = ctx;
    void _;
    prevContext = rest;
  }
  return out;
}

function candleStrideSec(candles: Candle[]): number {
  if (candles.length < 2) return 60;
  return Math.max(60, candles[candles.length - 1].time - candles[candles.length - 2].time);
}
