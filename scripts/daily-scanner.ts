import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { DnseAdapter } from '../src/server/adapters/dnse-adapter.js';
import { rankWatchlist } from '../src/server/scanner/watchlist-scanner.js';
import type { Timeframe } from '../src/shared/types.js';

async function run() {
    console.log('Bắt đầu tải dữ liệu nến Ngày (1D) cho rổ VN100...');
    const symbols: string[] = JSON.parse(readFileSync('./data/vn_symbols.json', 'utf-8'));
    const adapter = new DnseAdapter(process.env.DNSE_API_KEY!, process.env.DNSE_API_SECRET!);

    const inputs = [];
    let processed = 0;

    // Chia nhỏ request để không bị quá tải API
    const chunks = [];
    for (let i = 0; i < symbols.length; i += 10) {
        chunks.push(symbols.slice(i, i + 10));
    }

    const startTime = Date.now();

    for (const chunk of chunks) {
        const promises = chunk.map(async (symbol) => {
            try {
                const toSec = Math.floor(Date.now() / 1000);
                // Lấy dữ liệu khoảng 200 ngày gần nhất để indicator (EMA, Wave) có đủ data
                const fromSec = toSec - 86400 * 200; 
                const candles = await adapter.fetchHistorical({
                    symbol,
                    timeframe: '1d',
                    limit: 200,
                    sinceSec: fromSec,
                });
                // Scanner yêu cầu tối thiểu 60 nến để tính toán chính xác
                if (candles.length >= 60) {
                    return { symbol, timeframe: '1d' as Timeframe, candles };
                }
            } catch (e) {
                // Bỏ qua lỗi kết nối tạm thời của một vài mã
            }
            return null;
        });

        const results = await Promise.all(promises);
        for (const res of results) {
            if (res) inputs.push(res);
        }
        processed += chunk.length;
        process.stdout.write(`\rTiến độ: ${processed}/${symbols.length} mã...`);
    }

    console.log(`\nHoàn tất tải dữ liệu trong ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log('\nĐang chấm điểm (Scoring) và Xếp hạng (Ranking)...\n');
    
    // Lấy top 10 mã có điểm số cao nhất
    const topList = rankWatchlist(inputs, 10);

    console.log('===========================================================');
    console.log(' 🏆 BÁO CÁO TÍN HIỆU GIAO DỊCH CUỐI NGÀY (DAILY SUMMARY) 🏆');
    console.log('===========================================================');
    
    if (topList.length === 0) {
        console.log('Hôm nay không có mã nào có tín hiệu (form) đẹp.');
    } else {
        topList.forEach((entry, idx) => {
            console.log(`\n[${idx + 1}] ${entry.symbol} (Điểm: ${entry.score}) - Giá đóng cửa: ${entry.lastClose.toLocaleString('vi-VN')} VND`);
            entry.reasons.forEach(reason => {
                // Format lại thông báo tiếng Anh trong core sang tiếng Việt (Tuỳ chọn)
                let vnReason = reason;
                if (reason.includes('wave at point 4')) vnReason = 'Đang hình thành Sóng 5 (Điểm vào lệnh đẹp)';
                if (reason.includes('wave at point 2')) vnReason = 'Đang hình thành Sóng 3 (Điểm vào lệnh đẹp)';
                if (reason.includes('support touched')) vnReason = 'Vừa chạm vùng Hỗ trợ (Support)';
                if (reason.includes('resistance touched')) vnReason = 'Vừa chạm vùng Kháng cự (Resistance)';
                if (reason.includes('recent up impulse')) vnReason = 'Có lực tăng mạnh (Impulse) gần đây';
                
                console.log(`    • ${vnReason}`);
            });
        });
    }
    console.log('\n===========================================================');

    process.exit(0);
}

run().catch(console.error);