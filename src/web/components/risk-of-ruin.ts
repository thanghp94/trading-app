/**
 * Monte Carlo risk-of-ruin: given a strategy's historical R-multiples,
 * simulate `runs` independent trade sequences of length `horizon` by
 * sampling with replacement. Report the % of simulations that hit a
 * drawdown ≥ `targetDdPct`.
 *
 * This is the most-important survival number a novice can see — it
 * translates "my backtest looks great" into "my account has X% chance
 * of being cut in half over the next N trades".
 *
 * Returns multiple thresholds at once so users see a survival curve,
 * not just one number.
 */
export interface RorResult {
  /** Simulated DD probabilities, sorted descending by threshold. */
  thresholds: Array<{ ddPct: number; probability: number }>;
  /** Median final equity multiple (1.0 = breakeven). */
  medianFinalMult: number;
  /** 5th percentile (bad luck) final multiple. */
  p5FinalMult: number;
  /** 95th percentile (good luck) final multiple. */
  p95FinalMult: number;
  /** Trade count actually simulated per run. */
  horizon: number;
  /** Number of MC runs. */
  runs: number;
}

export function computeRiskOfRuin(args: {
  rMultiples: number[];
  riskPct: number; // e.g. 1 = 1% per trade
  horizon?: number; // default 100
  runs?: number;   // default 1000
  thresholds?: number[]; // DD% thresholds. Default [20, 35, 50]
}): RorResult | null {
  const rs = args.rMultiples.filter((r) => Number.isFinite(r));
  if (rs.length < 5) return null;
  const horizon = args.horizon ?? 100;
  const runs = args.runs ?? 1000;
  const thresholds = args.thresholds ?? [20, 35, 50];
  const riskFrac = args.riskPct / 100;

  const ddHits: Record<number, number> = {};
  thresholds.forEach((t) => { ddHits[t] = 0; });
  const finalMults: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    let equity = 1.0;
    let peak = 1.0;
    let maxDd = 0;
    for (let t = 0; t < horizon; t += 1) {
      const r = rs[Math.floor(Math.random() * rs.length)];
      // Trade PnL = r × riskFrac × equity (compounded position sizing)
      equity *= 1 + r * riskFrac;
      if (equity <= 0) { equity = 0; break; }
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
    for (const t of thresholds) {
      if (maxDd >= t) ddHits[t] += 1;
    }
    finalMults.push(equity);
  }

  finalMults.sort((a, b) => a - b);
  const pct = (p: number) => finalMults[Math.floor(finalMults.length * p)];

  return {
    thresholds: thresholds.map((t) => ({ ddPct: t, probability: ddHits[t] / runs })),
    medianFinalMult: pct(0.5),
    p5FinalMult: pct(0.05),
    p95FinalMult: pct(0.95),
    horizon,
    runs,
  };
}

/**
 * Generate the plain-English result paragraph from a backtest result.
 * Designed to be the FIRST thing a novice reads — no jargon, no grid.
 */
export function buildPlainSummary(args: {
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  startingBalance: number;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  worstR: number;
  bestR: number;
  totalFees: number;
  finalBalance: number;
  pnlPct: number;
  maxDdPct: number;
}): string {
  if (args.total === 0) {
    return `On ${args.symbol} ${args.timeframe} between ${args.fromDate} and ${args.toDate}, the strategy fired ZERO trades. Try loosening the gates (uncheck preferred-only, MTF) or widening the date range.`;
  }
  const verdict = args.pnlPct >= 5
    ? '✅ Profitable'
    : args.pnlPct >= 0
      ? '⚠️ Marginally profitable'
      : '❌ Lost money';
  const sampleCaveat = args.total < 30
    ? ` Sample size is SMALL (${args.total} trades) — results have wide error bars; treat with caution.`
    : args.total < 100
      ? ` Sample is moderate (${args.total} trades).`
      : '';
  const ddWarn = args.maxDdPct > 30
    ? ` 🚨 Max drawdown of ${args.maxDdPct.toFixed(0)}% would scare most novice traders into abandoning the system — consider reducing risk-per-trade.`
    : args.maxDdPct > 15
      ? ` Max drawdown of ${args.maxDdPct.toFixed(0)}% is uncomfortable but survivable.`
      : '';
  return `${verdict}. Over ${args.fromDate}–${args.toDate} on ${args.symbol} ${args.timeframe}, the strategy made ${args.total} trades — won ${args.wins}, lost ${args.losses} (${(args.winRate * 100).toFixed(0)}% win rate). Average outcome ${args.avgR >= 0 ? '+' : ''}${args.avgR.toFixed(2)}R per trade. Best trade ${args.bestR.toFixed(1)}R, worst ${args.worstR.toFixed(1)}R. Account went from $${args.startingBalance.toFixed(0)} to $${args.finalBalance.toFixed(0)} (${args.pnlPct >= 0 ? '+' : ''}${args.pnlPct.toFixed(1)}%) AFTER paying $${args.totalFees.toFixed(0)} in fees.${sampleCaveat}${ddWarn}`;
}

/**
 * Wilson score 95% confidence interval for a binomial proportion. Used to
 * show the win-rate margin so novices stop trusting 10-trade samples.
 *
 * Returns [low, high] in the 0..1 range. Returns [0, 1] for n < 1.
 */
export function wilsonCi(wins: number, total: number, z = 1.96): [number, number] {
  if (total < 1) return [0, 1];
  const p = wins / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
