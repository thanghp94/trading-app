import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { DnseAdapter } from '../src/server/adapters/dnse-adapter.js';
import { scoreOne } from '../src/server/scanner/watchlist-scanner.js';
import type { Candle } from '../src/shared/types.js';

// Top 10 mã cổ phiếu chất lượng thường có xu hướng rõ ràng
const TOP_SYMBOLS = ["FPT", "VCB", "HPG", "MBB", "CTG", "PNJ", "MWG", "DGC", "ACB", "TCB"];

// Khoảng thời gian test (từ 2020 đến nay)
const START_SEC = Math.floor(new Date('2020-01-01').getTime() / 1000);
const END_SEC = Math.floor(Date.now() / 1000);

async function runHoldingAnalysis() {
    console.log(`\n\x1b[1m📊 PHÂN TÍCH THỜI GIAN NẮM GIỮ TỐI ƯU (T+3, T+5, T+10, T+15)\x1b[0m`);
    console.log(`Test trên top ${TOP_SYMBOLS.length} mã VN30/VN100 từ 2020 đến nay...\n`);

    const adapter = new DnseAdapter(process.env.DNSE_API_KEY!, process.env.DNSE_API_SECRET!);
    
    const results = {
        'T+3': { wins: 0, losses: 0, sumPct: 0 },
        'T+5': { wins: 0, losses: 0, sumPct: 0 },
        'T+10': { wins: 0, losses: 0, sumPct: 0 },
        'T+15': { wins: 0, losses: 0, sumPct: 0 },
    };

    let totalSignals = 0;

    for (const symbol of TOP_SYMBOLS) {
        process.stdout.write(`Đang phân tích ${symbol}... `);
        try {
            const candles = await adapter.fetchHistorical({
                symbol,
                timeframe: '1d',
                limit: 2000,
                sinceSec: START_SEC
            });

            // Lọc nến trong phạm vi test
            const validCandles = candles.filter(c => c.time >= START_SEC && c.time <= END_SEC);
            if (validCandles.length < 100) {
                console.log('Quá ít dữ liệu.');
                continue;
            }

            let signalsFound = 0;

            // Quét qua từng ngày trong quá khứ, mô phỏng như ta đang ở ngày hôm đó
            // Start từ index 60 (do scanner cần tối thiểu 60 nến)
            for (let i = 60; i < validCandles.length - 20; i++) {
                const historySnapshot = validCandles.slice(0, i + 1);
                const currentDay = historySnapshot[historySnapshot.length - 1];
                
                // Gọi hàm chấm điểm của Bot
                const scoreRes = scoreOne({
                    symbol,
                    timeframe: '1d',
                    candles: historySnapshot
                });

                // Nếu có tín hiệu tốt (Điểm > 50 và là sóng Tăng/Bull)
                if (scoreRes && scoreRes.score >= 50 && scoreRes.reasons.some(r => r.includes('bull'))) {
                    const entryPrice = currentDay.close;
                    signalsFound++;
                    totalSignals++;

                    // Đánh giá lợi nhuận sau N ngày (T+3, T+5, T+10, T+15)
                    const holdingPeriods = [3, 5, 10, 15];
                    
                    holdingPeriods.forEach(days => {
                        const exitIndex = i + days;
                        // Nếu chưa đủ ngày (gần hiện tại quá), bỏ qua
                        if (exitIndex < validCandles.length) {
                            const exitPrice = validCandles[exitIndex].close;
                            const pctChange = ((exitPrice - entryPrice) / entryPrice) * 100;
                            const key = `T+${days}` as keyof typeof results;
                            
                            results[key].sumPct += pctChange;
                            if (pctChange > 0) results[key].wins++;
                            else results[key].losses++;
                        }
                    });

                    // Để tránh tín hiệu đè nhau liên tục, nhảy cóc 5 ngày
                    i += 5; 
                }
            }
            console.log(`Tìm thấy ${signalsFound} điểm mua.`);
        } catch (e) {
            console.log(`Lỗi: ${(e as Error).message}`);
        }
    }

    console.log(`\n===========================================================`);
    console.log(` 🏆 KẾT QUẢ ĐÁNH GIÁ TRÊN TỔNG SỐ ${totalSignals} TÍN HIỆU 🏆`);
    console.log(`===========================================================`);
    console.log(`Thời gian  |  Tỷ lệ thắng (Win Rate)  |  Lợi nhuận TB mỗi lệnh`);
    console.log(`-----------------------------------------------------------`);
    
    for (const [key, data] of Object.entries(results)) {
        const total = data.wins + data.losses;
        if (total === 0) continue;
        const winRate = ((data.wins / total) * 100).toFixed(1);
        const avgPct = (data.sumPct / total).toFixed(2);
        const color = data.sumPct >= 0 ? '\x1b[32m' : '\x1b[31m';
        
        console.log(`${key.padEnd(10)} |  ${winRate.padStart(5)}% (${data.wins}W-${data.losses}L)      |  ${color}${avgPct.padStart(5)}%\x1b[0m`);
    }
    console.log(`===========================================================\n`);

    process.exit(0);
}

runHoldingAnalysis().catch(console.error);