import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { DnseAdapter } from '../src/server/adapters/dnse-adapter.js';
import { computeZones } from '../src/shared/indicators/sr-zone-tracker.js';
import { computeWaves } from '../src/shared/indicators/wave-counter.js';
import { detectImpulses } from '../src/shared/indicators/impulse-detector.js';
import type { Timeframe } from '../src/shared/types.js';

async function run() {
    console.log(`Đang phân tích độ rộng thị trường (Market Breadth) của rổ VN100 hôm nay...\n`);
    const symbols: string[] = JSON.parse(readFileSync('./data/vn_symbols.json', 'utf-8'));
    const adapter = new DnseAdapter(process.env.DNSE_API_KEY!, process.env.DNSE_API_SECRET!);

    let bullWaves = 0;
    let bearWaves = 0;
    let bullImpulses = 0;
    let bearImpulses = 0;
    let atSupport = 0;
    let atResistance = 0;

    const chunks = [];
    for (let i = 0; i < symbols.length; i += 10) chunks.push(symbols.slice(i, i + 10));

    for (const chunk of chunks) {
        const promises = chunk.map(async (symbol) => {
            try {
                const toSec = Math.floor(Date.now() / 1000);
                const fromSec = toSec - 86400 * 200; 
                const candles = await adapter.fetchHistorical({
                    symbol, timeframe: '1d', limit: 200, sinceSec: fromSec,
                });
                if (candles.length < 60) return;

                const c = candles[candles.length - 1];
                const zones = computeZones(candles);
                const waves = computeWaves(candles);
                const impulses = detectImpulses(candles);

                // Wave Check
                const activeWave = waves.find(w => w.active);
                if (activeWave) {
                    if (activeWave.direction === 'bull') bullWaves++;
                    if (activeWave.direction === 'bear') bearWaves++;
                }

                // Zone Check (within 1% buffer)
                const margin = c.close * 0.01;
                const hitSupport = zones.find(z => z.state === 'active' && z.type === 'support' && c.close >= z.bottom - margin && c.close <= z.top + margin);
                if (hitSupport) atSupport++;
                
                const hitRes = zones.find(z => z.state === 'active' && z.type === 'resistance' && c.close >= z.bottom - margin && c.close <= z.top + margin);
                if (hitRes) atResistance++;

                // Impulse Check (last 3 days)
                const recentImpulse = impulses[impulses.length - 1];
                if (recentImpulse && candles.length - recentImpulse.index <= 3) {
                    if (recentImpulse.direction === 'bull') bullImpulses++;
                    if (recentImpulse.direction === 'bear') bearImpulses++;
                }
            } catch (e) {}
        });
        await Promise.all(promises);
        process.stdout.write('.');
    }

    console.log(`\n\n===========================================`);
    console.log(`📊 BỨC TRANH TOÀN CẢNH VN100 HÔM NAY`);
    console.log(`===========================================`);
    console.log(`1. CẤU TRÚC XU HƯỚNG (Trend Structure)`);
    console.log(`   - Số mã vào Sóng Tăng (Bull Wave): ${bullWaves} mã`);
    console.log(`   - Số mã vào Sóng Giảm (Bear Wave): ${bearWaves} mã`);
    
    console.log(`\n2. DÒNG TIỀN NGẮN HẠN (Lực đẩy 3 phiên gần nhất)`);
    console.log(`   - Dòng tiền vào (Bull Impulse):    ${bullImpulses} mã`);
    console.log(`   - Lực xả hàng (Bear Impulse):      ${bearImpulses} mã`);

    console.log(`\n3. ĐỊA HÌNH GIÁ (Price Location)`);
    console.log(`   - Đang lùi về Hỗ trợ (Chờ bật):    ${atSupport} mã`);
    console.log(`   - Đang đâm đầu Kháng cự (Cản):     ${atResistance} mã`);
    console.log(`===========================================\n`);

    process.exit(0);
}

run().catch(console.error);