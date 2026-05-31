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

  // ─── Realism pack ─────────────────────────────────────────────────────
  /**
   * Per-side commission in basis points (1 bp = 0.01%). Applied on both
   * entry fill and exit fill. VN HOSE retail ≈ 15 bps. Default 0.
   */
  feeBps?: number;
  /**
   * Additional sell-side tax in basis points. VN HOSE personal-income tax
   * on sale value ≈ 10 bps. Default 0.
   */
  sellTaxBps?: number;
  /**
   * Lot size — min shares per trade. VN equity = 100, futures/crypto = 1.
   * Position sizing rounds down to nearest multiple. If 0 shares fit the
   * risk budget, trade is skipped. Default 1.
   */
  lotSize?: number;
  /**
   * Settlement gate — minimum bars between entry and any exit. VN cash
   * equity T+2.5 ≈ 3 daily bars (cannot sell same day). 0 for futures,
   * forex, crypto. SL/TP checks are suppressed during settlement; if hit
   * during that window, exit waits until first eligible bar. Default 0.
   */
  settlementBars?: number;
  /**
   * VN session filter — when true, drops alerts that fire outside the HOSE
   * trading window (Vietnam UTC+7): 09:00–11:30 morning + 13:00–14:45
   * afternoon. Lunch break entries become un-fillable in reality.
   * No-op on daily timeframe. Default false.
   */
  vnSessionFilter?: boolean;

  // ─── Active trade management ─────────────────────────────────────────
  /**
   * Move SL to breakeven (entry price) once price moves +N×R in favor.
   * Default 0 = disabled. Common values: 1, 1.5.
   */
  breakevenAtR?: number;
  /**
   * Exit `partialPct`% of position at +N×R, let runner go to TP. The
   * runner's stop is moved to breakeven once the partial fires
   * (independent of breakevenAtR). Default 0 = disabled.
   */
  partialAtR?: number;
  /** Fraction (0–1) of shares to take off at partialAtR. Default 0.5. */
  partialPct?: number;
  /**
   * ATR-based trailing stop. Once active (after partial or BE), trail SL
   * by `trailAtrMult × ATR` from the running favorable extreme. Default
   * 0 = disabled. Common: 2.0–3.0.
   */
  trailAtrMult?: number;
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
  /** Net PnL after fees + tax. */
  pnlAbs: number;
  balanceAfter: number;
  /** Why this SL/TP was chosen — for transparency in result inspection. */
  slReason: string;
  tpReason: string;
  /** MTF check at entry time. Always populated, even when gating was off. */
  mtf: MtfCheck;
  // ─── Realism additions ─────────────────────────────────────────────
  /** Position size in shares (or contracts), lot-rounded. */
  shares: number;
  /** Total commission + sell-tax paid (always >= 0). */
  feesPaid: number;
  /** Raw PnL before fees. pnlAbs = grossPnl - feesPaid. */
  grossPnl: number;
  /** True when exit was delayed by settlement gate. */
  settlementDelayed: boolean;
  /** True if SL was moved to breakeven during the trade. */
  beMoved: boolean;
  /** True if a partial position was taken off before the final exit. */
  partialTaken: boolean;
  /** True if the trailing stop was the final exit trigger (not initial SL/TP). */
  trailedOut: boolean;
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
    /** Sum of all fees paid across trades. */
    totalFees: number;
    /** Trades skipped because lot-rounded shares = 0 (under-capitalized). */
    skippedNoCapital: number;
    /** Per-rule breakdown: which rule(s) actually made money. */
    perRule: Array<{
      rule: string;
      total: number;
      wins: number;
      losses: number;
      winRate: number;
      sumR: number;
      avgR: number;
      pnlAbs: number;
    }>;
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
  const feeBps = req.feeBps ?? 0;
  const sellTaxBps = req.sellTaxBps ?? 0;
  const lotSize = Math.max(1, req.lotSize ?? 1);
  const settlementBars = Math.max(0, req.settlementBars ?? 0);
  let skippedNoCapital = 0;
  const vnSessionFilter = req.vnSessionFilter ?? false;
  const breakevenAtR = req.breakevenAtR ?? 0;
  const partialAtR = req.partialAtR ?? 0;
  const partialPct = Math.max(0, Math.min(1, req.partialPct ?? 0.5));
  const trailAtrMult = req.trailAtrMult ?? 0;

  const alerts = replayAlerts(req.symbol, req.timeframe, req.candles, preferredOnly, vnSessionFilter);
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

    // ─── Position sizing — lot-rounded shares from risk budget ─────────
    const riskAmount = balance * (riskPct / 100);
    const rawShares = riskAmount / slDist;
    const shares = Math.floor(rawShares / lotSize) * lotSize;
    if (shares <= 0) {
      skippedNoCapital += 1;
      continue;
    }

    // ─── Walk forward with active trade management ──────────────────────
    // Dynamic state per trade:
    //   activeSl  — current stop, may move to BE or trail
    //   peakFav   — best favorable price seen (for trailing)
    //   partialRealized — booked partial PnL (price-points × shares-taken)
    //   sharesRemaining — runner shares after partial
    let exitIdx = entryIdx;
    let exit = entry;
    let outcome: BacktestOutcome = 'time-stop';
    let settlementDelayed = false;
    let activeSl = sl;
    let beMoved = false;
    let partialTaken = false;
    let trailedOut = false;
    let partialPriceCaptured = 0; // price at which partial fired
    let sharesRemaining = shares;
    const sharesPartial = partialAtR > 0 ? Math.floor(shares * partialPct / lotSize) * lotSize : 0;
    let peakFav = isBull ? entry : entry;
    let finalRMultiple = 0;

    for (let i = entryIdx + 1; i < req.candles.length && i <= entryIdx + maxBars; i += 1) {
      const bar = req.candles[i];
      const barsSinceEntry = i - entryIdx;
      const inSettlement = barsSinceEntry < settlementBars;

      // Update favorable extreme + active-management triggers BEFORE stop check.
      peakFav = isBull ? Math.max(peakFav, bar.high) : Math.min(peakFav, bar.low);
      const favR = isBull ? (peakFav - entry) / slDist : (entry - peakFav) / slDist;

      if (!inSettlement) {
        // Partial exit
        if (partialAtR > 0 && !partialTaken && sharesPartial > 0 && favR >= partialAtR) {
          partialTaken = true;
          partialPriceCaptured = isBull ? entry + partialAtR * slDist : entry - partialAtR * slDist;
          sharesRemaining = shares - sharesPartial;
          // Runner stop moves to BE on partial fire.
          activeSl = entry;
          beMoved = true;
        }
        // Breakeven SL move
        if (breakevenAtR > 0 && !beMoved && favR >= breakevenAtR) {
          activeSl = entry;
          beMoved = true;
        }
        // Trail
        if (trailAtrMult > 0 && (beMoved || partialTaken)) {
          const trailDist = a * trailAtrMult;
          const trailedSl = isBull ? peakFav - trailDist : peakFav + trailDist;
          activeSl = isBull ? Math.max(activeSl, trailedSl) : Math.min(activeSl, trailedSl);
        }
      }

      const slHit = !inSettlement && (isBull ? bar.low <= activeSl : bar.high >= activeSl);
      const tpHit = !inSettlement && (isBull ? bar.high >= tp : bar.low <= tp);
      if (inSettlement && (isBull ? bar.low <= activeSl || bar.high >= tp : bar.high >= activeSl || bar.low <= tp)) {
        settlementDelayed = true;
      }
      // Determine if exit was via trail (SL hit AND activeSl moved past entry)
      const slIsTrail = (isBull ? activeSl > entry : activeSl < entry);
      if (slHit && tpHit) {
        exit = activeSl; exitIdx = i;
        outcome = slIsTrail ? 'win' : 'loss';
        trailedOut = slIsTrail;
        break;
      }
      if (slHit) {
        exit = activeSl; exitIdx = i;
        outcome = slIsTrail ? 'win' : (beMoved ? 'breakeven' : 'loss');
        trailedOut = slIsTrail;
        break;
      }
      if (tpHit) {
        exit = tp; exitIdx = i;
        outcome = 'win';
        break;
      }
      if (i === entryIdx + maxBars || i === req.candles.length - 1) {
        exit = bar.close; exitIdx = i;
        const r = (isBull ? exit - entry : entry - exit) / slDist;
        outcome = Math.abs(r) < 0.05 ? 'breakeven' : 'time-stop';
      }
    }

    // Compute R-multiple from price-action (used for diagnostics only;
    // net R is recomputed below from net PnL after fees).
    const runnerRewardPerShare = isBull ? exit - entry : entry - exit;
    finalRMultiple = runnerRewardPerShare / slDist;

    // ─── Fees: entry leg covers ALL shares; exit leg may be split into
    // partial-leg + runner-leg, each fee'd separately at its own price. ─
    const entryFee = shares * entry * (feeBps / 10_000);
    const exitSellFeeBps = (feeBps + sellTaxBps) / 10_000;
    const runnerExitShares = partialTaken ? sharesRemaining : shares;
    const partialExitShares = partialTaken ? sharesPartial : 0;
    const exitFeeRunner = runnerExitShares * exit * exitSellFeeBps;
    const exitFeePartial = partialExitShares * partialPriceCaptured * exitSellFeeBps;
    const feesPaid = entryFee + exitFeeRunner + exitFeePartial;

    const runnerGross = runnerExitShares * (isBull ? exit - entry : entry - exit);
    const partialGross = partialTaken
      ? partialExitShares * (isBull ? partialPriceCaptured - entry : entry - partialPriceCaptured)
      : 0;
    const grossPnl = runnerGross + partialGross;
    const pnlAbs = grossPnl - feesPaid;
    // Recompute R-multiple on NET PnL so MTF/preferred toggles are judged
    // against real account growth, not idealized R.
    const netRMultiple = shares > 0 ? pnlAbs / (shares * slDist) : finalRMultiple;

    balance += pnlAbs;
    if (balance > peakBalance) peakBalance = balance;
    const dd = ((peakBalance - balance) / peakBalance) * 100;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;

    trades.push({
      alert, entryIdx, exitIdx, entry, sl, tp, exit,
      rMultiple: netRMultiple,
      outcome, pnlAbs,
      balanceAfter: balance, slReason, tpReason, mtf,
      shares, feesPaid, grossPnl, settlementDelayed,
      beMoved, partialTaken, trailedOut,
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

  const totalFees = trades.reduce((s, t) => s + t.feesPaid, 0);

  // Per-rule attribution: which rule(s) actually generate the equity?
  const perRuleMap = new Map<string, { total: number; wins: number; losses: number; sumR: number; pnlAbs: number }>();
  for (const t of trades) {
    const k = t.alert.rule;
    const cur = perRuleMap.get(k) ?? { total: 0, wins: 0, losses: 0, sumR: 0, pnlAbs: 0 };
    cur.total += 1;
    if (t.outcome === 'win') cur.wins += 1;
    if (t.outcome === 'loss') cur.losses += 1;
    cur.sumR += t.rMultiple;
    cur.pnlAbs += t.pnlAbs;
    perRuleMap.set(k, cur);
  }
  const perRule = [...perRuleMap.entries()]
    .map(([rule, s]) => ({
      rule,
      total: s.total,
      wins: s.wins,
      losses: s.losses,
      winRate: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0,
      sumR: s.sumR,
      avgR: s.total > 0 ? s.sumR / s.total : 0,
      pnlAbs: s.pnlAbs,
    }))
    .sort((a, b) => b.sumR - a.sumR);

  return {
    symbol: req.symbol,
    timeframe: req.timeframe,
    trades,
    equity,
    stats: {
      total: trades.length, wins, losses, breakeven, timeStops, winRate,
      avgR, bestR, worstR, sumR, maxDrawdownPct, finalBalance: balance,
      pnlPct: ((balance - startingBalance) / startingBalance) * 100,
      totalFees, skippedNoCapital, perRule,
    },
  };
}

function replayAlerts(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
  preferredOnly: boolean,
  vnSessionFilter: boolean,
): Alert[] {
  const out: Alert[] = [];
  const lastFiredBar = new Map<string, number>();
  let prevContext: Omit<RuleContext, 'prev'> | undefined;
  const stride = candleStrideSec(candles);
  // VN session filter is a no-op on daily bars (each bar represents the
  // whole session anyway).
  const applySessionFilter = vnSessionFilter && timeframe !== '1d';

  for (let i = 50; i < candles.length; i += 1) {
    const slice = candles.slice(0, i + 1);
    const candle = slice[slice.length - 1];
    if (!candle.closed) continue;
    if (applySessionFilter && !inVnSession(candle.time)) continue;
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

/**
 * HOSE trading window in Vietnam time (UTC+7):
 *   Morning continuous : 09:00 – 11:30
 *   Afternoon continuous: 13:00 – 14:30
 *   ATC                : 14:30 – 14:45
 * Lunch break (11:30–13:00) is closed — entries firing there can't fill.
 */
function inVnSession(unixSec: number): boolean {
  const vnSec = (unixSec + 7 * 3600) % 86400;
  const hour = Math.floor(vnSec / 3600);
  const minute = Math.floor((vnSec % 3600) / 60);
  const mins = hour * 60 + minute;
  const morningOpen = 9 * 60;       // 09:00
  const morningClose = 11 * 60 + 30; // 11:30
  const afternoonOpen = 13 * 60;     // 13:00
  const afternoonClose = 14 * 60 + 45; // 14:45 incl. ATC
  return (mins >= morningOpen && mins < morningClose)
      || (mins >= afternoonOpen && mins < afternoonClose);
}
