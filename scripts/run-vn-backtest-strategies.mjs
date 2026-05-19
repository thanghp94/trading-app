/**
 * Runs 6 VN backtest strategies one by one using DNSE data.
 * Usage: node scripts/run-vn-backtest-strategies.mjs
 */
import 'dotenv/config';
import { DnseAdapter } from '../dist/server/server/adapters/dnse-adapter.js';
import { runBacktest } from '../dist/server/server/backtest/backtest-engine.js';

const strategies = [
  {
    name: '1. Wave-5 Pure — VN30F1M 1h (2022→2026)',
    symbol: 'VN30F1M', timeframe: '1h',
    fromDate: '2022-01-01', toDate: '2026-05-19',
    slMode: 'trigger-wick', tpMode: 'next-resistance',
    rrTarget: 2.5, maxBars: 20, riskPct: 1,
    preferredOnly: true, mtfTrendAlign: true, mtfZoneConfluence: false,
  },
  {
    name: '2. Wave-5 Pure — HPG 1d (2019→2026)',
    symbol: 'HPG', timeframe: '1d',
    fromDate: '2019-01-01', toDate: '2026-05-19',
    slMode: 'trigger-wick', tpMode: 'next-resistance',
    rrTarget: 2.5, maxBars: 20, riskPct: 1,
    preferredOnly: true, mtfTrendAlign: true, mtfZoneConfluence: false,
  },
  {
    name: '3. HTF Zone Bounce — VCB 1d (2019→2026)',
    symbol: 'VCB', timeframe: '1d',
    fromDate: '2019-01-01', toDate: '2026-05-19',
    slMode: 'trigger-wick', tpMode: 'next-resistance',
    rrTarget: 2, maxBars: 15, riskPct: 1,
    preferredOnly: false, mtfTrendAlign: false, mtfZoneConfluence: true,
  },
  {
    name: '4. MTF Trend Continuation — HPG 1d BULL (2020→2022)',
    symbol: 'HPG', timeframe: '1d',
    fromDate: '2020-01-01', toDate: '2022-01-01',
    slMode: 'pct', slPct: 0.003, tpMode: 'rr',
    rrTarget: 3, maxBars: 40, riskPct: 1,
    preferredOnly: false, mtfTrendAlign: true, mtfZoneConfluence: false,
  },
  {
    name: '5. MTF Trend Continuation — HPG 1d BEAR (2022→2023)',
    symbol: 'HPG', timeframe: '1d',
    fromDate: '2022-01-01', toDate: '2023-06-01',
    slMode: 'pct', slPct: 0.003, tpMode: 'rr',
    rrTarget: 3, maxBars: 40, riskPct: 1,
    preferredOnly: false, mtfTrendAlign: true, mtfZoneConfluence: false,
  },
  {
    name: '6. No Filter (baseline) — FPT 1d (2019→2026)',
    symbol: 'FPT', timeframe: '1d',
    fromDate: '2019-01-01', toDate: '2026-05-19',
    slMode: 'trigger-wick', tpMode: 'next-resistance',
    rrTarget: 2, maxBars: 30, riskPct: 1,
    preferredOnly: false, mtfTrendAlign: false, mtfZoneConfluence: false,
  },
];

async function fetchCandles(strategy) {
  const adapter = new DnseAdapter(process.env.DNSE_API_KEY, process.env.DNSE_API_SECRET);
  try {
    const fromSec = Math.floor(new Date(strategy.fromDate).getTime() / 1000);
    const toSec = Math.floor(new Date(strategy.toDate).getTime() / 1000) + 86400;
    const candles = await adapter.fetchHistorical({
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      limit: 50000,
      sinceSec: fromSec,
    });
    return candles.filter(c => c.time >= fromSec && c.time <= toSec);
  } finally {
    await adapter.close();
  }
}

function printResult(strategyName, result) {
  const s = result.stats;
  const bar = s.sumR >= 0 ? '█'.repeat(Math.min(20, Math.floor(s.sumR))) : '▒'.repeat(Math.min(20, Math.floor(-s.sumR)));
  const color = s.sumR >= 0 ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${bold}${strategyName}${reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Trades   : ${s.total} (${s.wins}W · ${s.losses}L · ${s.breakeven}BE · ${s.timeStops}TS)`);
  console.log(`Win Rate : ${(s.winRate * 100).toFixed(1)}%`);
  console.log(`Avg R    : ${color}${s.avgR.toFixed(2)}R${reset}`);
  console.log(`Sum R    : ${color}${s.sumR.toFixed(1)}R  ${bar}${reset}`);
  console.log(`Best R   : \x1b[32m${s.bestR.toFixed(2)}R${reset}  |  Worst R: \x1b[31m${s.worstR.toFixed(2)}R${reset}`);
  console.log(`Max DD   : \x1b[31m${s.maxDrawdownPct.toFixed(1)}%${reset}`);
  console.log(`PnL      : ${color}${s.pnlPct >= 0 ? '+' : ''}${s.pnlPct.toFixed(1)}%${reset}  (final $${s.finalBalance.toFixed(0)})`);
}

async function main() {
  console.log('\n\x1b[1m🇻🇳 VN BACKTEST — STRATEGY COMPARISON\x1b[0m');
  console.log('Starting balance: $10,000 | Risk per trade: 1%\n');

  for (const strategy of strategies) {
    process.stdout.write(`Fetching ${strategy.symbol} ${strategy.timeframe} (${strategy.fromDate} → ${strategy.toDate})... `);
    try {
      const candles = await fetchCandles(strategy);
      process.stdout.write(`${candles.length} candles. Running backtest... `);

      if (candles.length < 50) {
        console.log(`\x1b[33mSKIPPED — too few candles (${candles.length})\x1b[0m`);
        continue;
      }

      const result = runBacktest({
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        candles,
        slMode: strategy.slMode,
        slPct: strategy.slPct ?? 0.005,
        tpMode: strategy.tpMode,
        rrTarget: strategy.rrTarget,
        maxBars: strategy.maxBars,
        riskPct: strategy.riskPct,
        startingBalance: 10000,
        preferredOnly: strategy.preferredOnly,
        mtfTrendAlign: strategy.mtfTrendAlign,
        mtfZoneConfluence: strategy.mtfZoneConfluence,
      });

      console.log('done.');
      printResult(strategy.name, result);
    } catch (err) {
      console.log(`\x1b[31mERROR: ${err.message}\x1b[0m`);
    }
  }

  console.log(`\n${'═'.repeat(60)}\n`);
}

main().catch(console.error);
