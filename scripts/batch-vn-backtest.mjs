import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { DnseAdapter } from '../dist/server/server/adapters/dnse-adapter.js';
import { runBacktest } from '../dist/server/server/backtest/backtest-engine.js';

// Đọc danh sách đã verify
const symbols = JSON.parse(readFileSync('./data/vn_symbols.json', 'utf-8'));

// Cấu hình chiến lược Backtest (MTF Trend Continuation - Bear Market)
// Chứng khoán VN chỉ có thể mua (LONG) nên test này chúng ta dùng
// Wave-5 Pure thay vì cố short trong Bear market.
const strategy = {
    name: 'Wave-5 Pure — VN100 1d (2020→2026)',
    timeframe: '1d',
    fromDate: '2020-01-01',
    toDate: '2026-05-19',
    slMode: 'trigger-wick', 
    tpMode: 'next-resistance',
    rrTarget: 2.5, 
    maxBars: 20, 
    riskPct: 1,
    preferredOnly: true, 
    mtfTrendAlign: true, 
    mtfZoneConfluence: false,
};

async function fetchCandles(adapter, symbol) {
    const fromSec = Math.floor(new Date(strategy.fromDate).getTime() / 1000);
    const toSec = Math.floor(new Date(strategy.toDate).getTime() / 1000) + 86400;
    const candles = await adapter.fetchHistorical({
        symbol,
        timeframe: strategy.timeframe,
        limit: 50000,
        sinceSec: fromSec,
    });
    return candles.filter(c => c.time >= fromSec && c.time <= toSec);
}

async function runBatch() {
    const adapter = new DnseAdapter(process.env.DNSE_API_KEY, process.env.DNSE_API_SECRET);
    console.log(`\n\x1b[1m🇻🇳 BATCH BACKTEST — ${strategy.name}\x1b[0m`);
    console.log(`Running on ${symbols.length} symbols...\n`);

    const results = [];
    let processed = 0;
    
    // Batch requests in chunks to manage memory and API rate limits
    const chunks = [];
    for (let i = 0; i < symbols.length; i += 5) { // 5 mã một lúc
        chunks.push(symbols.slice(i, i + 5));
    }

    const startTime = Date.now();

    for (const chunk of chunks) {
        const promises = chunk.map(async (symbol) => {
            try {
                const candles = await fetchCandles(adapter, symbol);
                if (candles.length < 50) return null; // Quá ít nến

                const result = runBacktest({
                    symbol,
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
                
                return { symbol, result };
            } catch (err) {
                return null;
            }
        });

        const chunkResults = (await Promise.all(promises)).filter(r => r !== null);
        results.push(...chunkResults);
        
        processed += chunk.length;
        process.stdout.write(`\rProgress: ${processed}/${symbols.length} symbols...`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\nCompleted in ${elapsed}s`);

    // Tổng hợp kết quả
    results.sort((a, b) => b.result.stats.sumR - a.result.stats.sumR);

    let totalR = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalTrades = 0;
    
    console.log(`\n\x1b[1m🏆 TOP 15 MÃ HIỆU QUẢ NHẤT\x1b[0m`);
    console.log(`Symbol | Trades | Win%  | Sum R   | PnL%`);
    console.log('-------|--------|-------|---------|-------');
    
    for (const { symbol, result } of results) {
        const s = result.stats;
        totalR += s.sumR;
        totalTrades += s.total;
        totalWins += s.wins;
        totalLosses += s.losses;
    }

    for (const { symbol, result } of results.slice(0, 15)) {
        const s = result.stats;
        const color = s.sumR >= 0 ? '\x1b[32m' : '\x1b[31m';
        const pnlStr = (s.pnlPct > 0 ? '+' : '') + s.pnlPct.toFixed(1) + '%';
        console.log(`${symbol.padEnd(6)} | ${s.total.toString().padEnd(6)} | ${(s.winRate*100).toFixed(1).padEnd(5)} | ${color}${s.sumR.toFixed(1).padEnd(6)} R\x1b[0m | ${color}${pnlStr}\x1b[0m`);
    }

    console.log(`\n\x1b[1m📊 TỔNG QUAN DANH MỤC\x1b[0m`);
    const winRateTotal = totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(1) : 0;
    console.log(`Total Symbols : ${results.length}`);
    console.log(`Total Trades  : ${totalTrades} (${totalWins}W - ${totalLosses}L)`);
    console.log(`Avg Win Rate  : ${winRateTotal}%`);
    console.log(`Total Sum R   : ${totalR > 0 ? '\x1b[32m' : '\x1b[31m'}${totalR.toFixed(1)} R\x1b[0m`);
    
    // Lưu kết quả report chi tiết
    writeFileSync('./data/vn_backtest_report.json', JSON.stringify(results.map(r => ({
        symbol: r.symbol,
        sumR: r.result.stats.sumR,
        pnlPct: r.result.stats.pnlPct,
        trades: r.result.stats.total,
        winRate: r.result.stats.winRate
    })), null, 2));
    
    console.log(`\nFull report saved to data/vn_backtest_report.json`);
    process.exit(0);
}

runBatch().catch(console.error);