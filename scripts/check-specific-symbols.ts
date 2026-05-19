import 'dotenv/config';
import { DnseAdapter } from '../src/server/adapters/dnse-adapter.js';
import { scoreOne } from '../src/server/scanner/watchlist-scanner.js';
import type { Timeframe } from '../src/shared/types.js';

async function run() {
    const symbols = ["IDC", "TNG", "HAG", "DPG"];
    console.log(`Đang kiểm tra điểm số cho các mã: ${symbols.join(', ')}...\n`);
    
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

            if (candles.length < 60) {
                console.log(`[${symbol}] Không đủ dữ liệu nến (${candles.length}/60)`);
                continue;
            }

            const result = scoreOne({
                symbol,
                timeframe: '1d' as Timeframe,
                candles
            });

            if (result) {
                console.log(`✅ [${symbol}] Điểm: ${result.score} - Giá: ${result.lastClose.toLocaleString('vi-VN')} VND`);
                result.reasons.forEach(r => console.log(`    • ${r}`));
            } else {
                console.log(`❌ [${symbol}] Điểm: 0 (Không có setup Sóng/Hỗ trợ nào khả dụng) - Giá: ${candles[candles.length - 1].close.toLocaleString('vi-VN')} VND`);
            }
            console.log('---');
            
        } catch (e) {
            console.log(`[${symbol}] Lỗi lấy dữ liệu: ${(e as Error).message}`);
        }
    }
    
    process.exit(0);
}

run().catch(console.error);