import type { Alert, Candle, Timeframe } from '../../shared/types.js';
import { computeZones } from '../../shared/indicators/sr-zone-tracker.js';
import { computeWaves } from '../../shared/indicators/wave-counter.js';
import { ALL_RULES } from '../alerts/rules/index.js';
import type { RuleContext } from '../alerts/rule-types.js';

export interface BacktestRequest {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  /** Risk in absolute price terms: SL distance from entry. Defaults to 0.5% of entry. */
  slPct?: number;
  /** Reward:Risk multiple for take-profit. Default 2 (2R targets). */
  rrTarget?: number;
  /** Time-stop: close trade after this many bars even if neither SL/TP hit. Default 30. */
  maxBars?: number;
  /** Risk per trade in % of starting balance. Default 1. */
  riskPct?: number;
  /** Starting equity. Default 10000. */
  startingBalance?: number;
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
 * Walk through historical candles bar-by-bar, run the same RuleEvaluator
 * logic that lives in production, and simulate a trade for every fired
 * alert.
 *
 * Trade lifecycle for each alert:
 *   - Entry at the bar's close (the bar that fired the rule).
 *   - SL = entry ± slPct of entry (against the alert's direction).
 *   - TP = entry + rrTarget × |entry-SL| (in alert direction).
 *   - Walk forward bar by bar:
 *       - if (high or low) crosses SL first → loss = -1R
 *       - if (high or low) crosses TP first → win = +rrTarget × R
 *       - if maxBars elapse → time-stop, exit at close
 *     Conservative tie-break: when both SL and TP are within the same bar's
 *     range, assume SL hit first (worst case).
 *
 * No mid-trade overlap handling: each alert spawns its own independent
 * trade. With cooldowns this rarely overlaps in practice.
 */
export function runBacktest(req: BacktestRequest): BacktestResult {
  const slPct = req.slPct ?? 0.005;
  const rrTarget = req.rrTarget ?? 2;
  const maxBars = req.maxBars ?? 30;
  const riskPct = req.riskPct ?? 1;
  const startingBalance = req.startingBalance ?? 10000;

  // Step 1: replay rule evaluation through history. Mirror production logic
  // in a streaming pass so cooldown bookkeeping matches what would have
  // happened in real time.
  const alerts = replayAlerts(req.symbol, req.timeframe, req.candles);

  // Step 2: simulate trades.
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
    const slDist = entry * slPct;
    const sl = isBull ? entry - slDist : entry + slDist;
    const tp = isBull ? entry + slDist * rrTarget : entry - slDist * rrTarget;

    let exitIdx = entryIdx;
    let exit = entry;
    let rMultiple = 0;
    let outcome: BacktestOutcome = 'time-stop';

    for (let i = entryIdx + 1; i < req.candles.length && i <= entryIdx + maxBars; i += 1) {
      const bar = req.candles[i];
      const slHit = isBull ? bar.low <= sl : bar.high >= sl;
      const tpHit = isBull ? bar.high >= tp : bar.low <= tp;
      if (slHit && tpHit) {
        // Conservative: assume SL hit first.
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
        rMultiple = rrTarget;
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
      alert,
      entryIdx,
      exitIdx,
      entry,
      sl,
      tp,
      exit,
      rMultiple,
      outcome,
      pnlAbs,
      balanceAfter: balance,
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
      total: trades.length,
      wins,
      losses,
      breakeven,
      timeStops,
      winRate,
      avgR,
      bestR,
      worstR,
      sumR,
      maxDrawdownPct,
      finalBalance: balance,
      pnlPct: ((balance - startingBalance) / startingBalance) * 100,
    },
  };
}

/**
 * Streaming alert replay — same logic as RuleEvaluator but offline. We
 * accumulate candles bar by bar, recompute zones + waves, run rules, and
 * collect every fired alert into an array.
 */
function replayAlerts(symbol: string, timeframe: Timeframe, candles: Candle[]): Alert[] {
  const out: Alert[] = [];
  const lastFiredBar = new Map<string, number>();
  let prevContext: Omit<RuleContext, 'prev'> | undefined;
  const stride = candleStrideSec(candles);

  // Need at least 50 bars for indicators to warm up. Skip the first
  // chunk; rules will start firing after.
  for (let i = 50; i < candles.length; i += 1) {
    const slice = candles.slice(0, i + 1);
    const candle = slice[slice.length - 1];
    if (!candle.closed) continue;
    const zones = computeZones(slice);
    const waves = computeWaves(slice);
    const ctx: RuleContext = {
      symbol,
      timeframe,
      candles: slice,
      candle,
      zones,
      waves,
      prev: prevContext,
    };
    for (const rule of ALL_RULES) {
      const fired = rule.evaluate(ctx);
      if (!fired) continue;
      const cooldownKey = `${rule.key}:${symbol}:${timeframe}`;
      const lastBar = lastFiredBar.get(cooldownKey) ?? -Infinity;
      const barsSince = (candle.time - lastBar) / stride;
      if (barsSince < rule.cooldownBars) continue;
      lastFiredBar.set(cooldownKey, candle.time);
      out.push({
        id: `bt:${cooldownKey}:${candle.time}`,
        symbol,
        timeframe,
        time: candle.time,
        price: candle.close,
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
