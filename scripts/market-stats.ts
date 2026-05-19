import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { DnseAdapter } from '../src/server/adapters/dnse-adapter.js';

async function run() {
    console.log(`Đang tính toán Thống kê thị trường (Volume & Index) từ rổ VN100...\n`);
    const symbols = JSON.parse(readFileSync('./data/vn_symbols.json', 'utf-8'));
    const adapter = new DnseAdapter(process.env.DNSE_API_KEY, process.env.DNSE_API_SECRET);

    let totalVolume = 0;
    let totalPriceChangePct = 0;
    let count = 0;

    const chunks = [];
    for (let i = 0; i < symbols.length; i += 10) chunks.push(symbols.slice(i, i + 10));

    for (const chunk of chunks) {
        const promises = chunk.map(async (symbol) => {
            try {
                const toSec = Math.floor(Date.now() / 1000);
                const fromSec = toSec - 86400 * 5;
                const candles = await adapter.fetchHistorical({
                    symbol, timeframe: '1d', limit: 2, sinceSec: fromSec,
                });
                if (candles.length >= 2) {
                    const last = candles[candles.length - 1];
                    const prev = candles[candles.length - 2];
                    
                    totalVolume += last.volume;
                    totalPriceChangePct += ((last.close - prev.close) / prev.close) * 100;
                    count++;
                }
            } catch (e) {}
        });
        await Promise.all(promises);
        process.stdout.write('.');
    }

    if (count > 0) {
        const avgChange = totalPriceChangePct / count;
        console.log(`\n\n===========================================`);
        console.log(`📊 THỐNG KÊ THỊ TRƯỜNG (PROXY QUA VN100)`);
        console.log(`===========================================`);
        console.log(`1. TỔNG KHỐI LƯỢNG (VN100 Volume):`);
        console.log(`   - ${totalVolume.toLocaleString()} cổ phiếu`);
        console.log(`   - (Chiếm khoảng 70-80% thanh khoản toàn sàn)`);
        
        console.log(`\n2. BIẾN ĐỘNG ĐIỂM SỐ (Internal Index):`);
        const status = avgChange >= 0 ? 'TĂNG' : 'GIẢM';
        const color = avgChange >= 0 ? '🟢' : '🔴';
        console.log(`   - Thị trường trung bình ${status}: ${color} ${avgChange.toFixed(2)}%`);
        
        if (Math.abs(avgChange) < 0.2) {
            console.log(`   - Trạng thái: ĐI NGANG (Sideway)`);
        } else if (avgChange > 0.5) {
            console.log(`   - Trạng thái: TĂNG TRƯỞNG MẠNH`);
        } else if (avgChange < -0.5) {
            console.log(`   - Trạng thái: ÁP LỰC BÁN MẠNH`);
        }
        console.log(`===========================================\n`);
    }

    await adapter.close();
    process.exit(0);
}

run().catch(console.error);