import 'dotenv/config';
import { DnseAdapter } from '../src/server/adapters/dnse-adapter.js';
import { analyzeChart } from '../src/server/ai/analyze.js';
import { computeZones } from '../src/shared/indicators/sr-zone-tracker.js';
import { computeWaves } from '../src/shared/indicators/wave-counter.js';

async function getAiAdvice() {
    const symbols = ["IDC", "TNG", "HAG", "DPG"];
    console.log(`Đang phân tích sâu bằng AI (Claude Haiku) cách xử lý kẹt hàng cho: ${symbols.join(', ')}...\n`);
    
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error("Lỗi: Không tìm thấy ANTHROPIC_API_KEY trong .env. Không thể gọi AI.");
        process.exit(1);
    }

    const adapter = new DnseAdapter(process.env.DNSE_API_KEY!, process.env.DNSE_API_SECRET!);

    for (const symbol of symbols) {
        try {
            const toSec = Math.floor(Date.now() / 1000);
            const fromSec = toSec - 86400 * 200; 
            const candles = await adapter.fetchHistorical({
                symbol,
                timeframe: '1d',
                limit: 200,
                sinceSec: fromSec,
            });

            if (candles.length < 60) continue;

            const zones = computeZones(candles);
            const waves = computeWaves(candles);
            
            console.log(`=========================================`);
            console.log(`🤖 AI Nhận định mã: ${symbol} (Giá hiện tại: ${candles[candles.length - 1].close.toLocaleString('vi-VN')})`);
            console.log(`=========================================`);

            const aiRes = await analyzeChart({
                symbol,
                timeframe: '1d',
                candles,
                zones,
                waves
            });

            if (aiRes.ok && aiRes.text) {
                console.log(aiRes.text);
            } else {
                console.log(`Lỗi AI: ${aiRes.error}`);
            }
            console.log('\n');
            
        } catch (e) {
            console.log(`[${symbol}] Lỗi: ${(e as Error).message}`);
        }
    }
    
    process.exit(0);
}

getAiAdvice().catch(console.error);