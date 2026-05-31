import type { Candle, Timeframe } from '../../shared/types.js';
import { runBacktest, type BacktestRequest, type BacktestResult, type BacktestTrade } from './backtest-engine.js';

export interface PortfolioRequest {
  /** Per-symbol candle history. Key = symbol. */
  symbolCandles: Record<string, Candle[]>;
  timeframe: Timeframe;
  /** Config applied to every symbol. */
  base: Partial<BacktestRequest>;
  /**
   * Total portfolio starting capital. Each symbol gets allocation =
   * startingBalance / N symbols (equal-weight). Risk-per-trade still
   * applies to each symbol's slice.
   */
  startingBalance?: number;
}

export interface PortfolioSymbolResult {
  symbol: string;
  candleCount: number;
  stats: BacktestResult['stats'];
  trades: BacktestTrade[];
}

export interface PortfolioResult {
  perSymbol: PortfolioSymbolResult[];
  aggregate: {
    totalSymbols: number;
    totalTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    timeStops: number;
    winRate: number;
    avgR: number;
    sumR: number;
    totalFees: number;
    startingBalance: number;
    finalBalance: number;
    pnlPct: number;
    maxDrawdownPct: number;
    /** Best/worst symbol by sumR. */
    bestSymbol: string | null;
    worstSymbol: string | null;
  };
  /** Combined chronologically-merged equity curve across all symbols. */
  equity: Array<{ time: number; balance: number }>;
}

/**
 * Multi-symbol backtest. Each symbol runs its own bar-by-bar replay with
 * an equal-weight capital slice. Trades from all symbols are then merged
 * chronologically to produce a portfolio equity curve and aggregate stats.
 *
 * Limitations: no inter-symbol position limits, no correlation-aware
 * sizing — every symbol trades independently up to its slice. That over-
 * states diversification benefit when symbols co-move (HOSE basket).
 */
export function runPortfolio(req: PortfolioRequest): PortfolioResult {
  const symbols = Object.keys(req.symbolCandles).filter((s) => req.symbolCandles[s].length >= 50);
  if (symbols.length === 0) {
    throw new Error('No symbols with ≥50 candles');
  }
  const portfolioStarting = req.startingBalance ?? 100_000;
  const perSlice = portfolioStarting / symbols.length;

  const perSymbol: PortfolioSymbolResult[] = symbols.map((symbol) => {
    const candles = req.symbolCandles[symbol];
    const result = runBacktest({
      ...(req.base as BacktestRequest),
      symbol,
      timeframe: req.timeframe,
      candles,
      startingBalance: perSlice,
    });
    return { symbol, candleCount: candles.length, stats: result.stats, trades: result.trades };
  });

  // Aggregate: merge all trades chronologically, walk a single equity curve.
  type TaggedTrade = BacktestTrade & { symbol: string };
  const allTrades: TaggedTrade[] = perSymbol.flatMap((s) =>
    s.trades.map((t) => ({ ...t, symbol: s.symbol })),
  );
  allTrades.sort((a, b) => a.exitIdx - b.exitIdx); // proxy when no time field
  // Real time-sort using exit candle time when available
  const tradesByTime = perSymbol.flatMap((s) =>
    s.trades.map((t) => {
      const exitCandle = req.symbolCandles[s.symbol][t.exitIdx];
      return { trade: t, symbol: s.symbol, time: exitCandle?.time ?? 0 };
    }),
  ).sort((a, b) => a.time - b.time);

  let balance = portfolioStarting;
  let peak = portfolioStarting;
  let maxDD = 0;
  const equity: Array<{ time: number; balance: number }> = [
    { time: tradesByTime[0]?.time ?? Date.now() / 1000, balance: portfolioStarting },
  ];
  for (const { trade, time } of tradesByTime) {
    balance += trade.pnlAbs;
    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
    equity.push({ time, balance });
  }

  const totalTrades = allTrades.length;
  const wins = allTrades.filter((t) => t.outcome === 'win').length;
  const losses = allTrades.filter((t) => t.outcome === 'loss').length;
  const breakeven = allTrades.filter((t) => t.outcome === 'breakeven').length;
  const timeStops = allTrades.filter((t) => t.outcome === 'time-stop').length;
  const rs = allTrades.map((t) => t.rMultiple);
  const sumR = rs.reduce((a, b) => a + b, 0);
  const totalFees = allTrades.reduce((s, t) => s + t.feesPaid, 0);

  // Best / worst symbol by sumR
  let bestSym: string | null = null; let worstSym: string | null = null;
  let bestR = -Infinity; let worstR = Infinity;
  for (const s of perSymbol) {
    if (s.stats.sumR > bestR) { bestR = s.stats.sumR; bestSym = s.symbol; }
    if (s.stats.sumR < worstR) { worstR = s.stats.sumR; worstSym = s.symbol; }
  }

  return {
    perSymbol,
    aggregate: {
      totalSymbols: symbols.length,
      totalTrades, wins, losses, breakeven, timeStops,
      winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
      avgR: totalTrades > 0 ? sumR / totalTrades : 0,
      sumR, totalFees,
      startingBalance: portfolioStarting,
      finalBalance: balance,
      pnlPct: ((balance - portfolioStarting) / portfolioStarting) * 100,
      maxDrawdownPct: maxDD,
      bestSymbol: bestSym, worstSymbol: worstSym,
    },
    equity,
  };
}
