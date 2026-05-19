import 'dotenv/config';
import { readFileSync } from 'node:fs';
import cron from 'node-cron';
import { DnseAdapter } from '../src/server/adapters/dnse-adapter.js';
import { rankWatchlist } from '../src/server/scanner/watchlist-scanner.js';
import { analyzeChart } from '../src/server/ai/analyze.js';
import { computeZones } from '../src/shared/indicators/sr-zone-tracker.js';
import { computeWaves } from '../src/shared/indicators/wave-counter.js';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Gửi tin nhắn Markdown qua Telegram Bot API (không phụ thuộc thư viện ngoài)
 */
async function sendTelegram(text) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('[Telegram] Thiếu TOKEN hoặc CHAT_ID trong .env');
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }),
        });
        if (!res.ok) console.error(`[Telegram] Lỗi: ${await res.text()}`);
    } catch (err) {
        console.error('[Telegram] Error:', err);
    }
}

/**
 * Thực thi quét và gửi báo cáo
 */
async function runDailyReport() {
    console.log(`[${new Date().toLocaleString()}] Bắt đầu chạy báo cáo hàng ngày...`);
    
    let symbols = [];
    try {
        symbols = JSON.parse(readFileSync('./data/vn_symbols.json', 'utf-8'));
    } catch (e) {
        console.error('Không tìm thấy file data/vn_symbols.json. Hãy chạy scripts/generate-vn-symbols.mjs trước.');
        return;
    }

    const adapter = new DnseAdapter(process.env.DNSE_API_KEY, process.env.DNSE_API_SECRET);
    const inputs = [];
    
    // 1. Tải dữ liệu 200 nến cho mỗi mã
    const chunks = [];
    for (let i = 0; i < symbols.length; i += 10) chunks.push(symbols.slice(i, i + 10));

    for (const chunk of chunks) {
        const results = await Promise.all(chunk.map(async (symbol) => {
            try {
                const toSec = Math.floor(Date.now() / 1000);
                const fromSec = toSec - 86400 * 250; 
                const candles = await adapter.fetchHistorical({ symbol, timeframe: '1d', limit: 250, sinceSec: fromSec });
                if (candles.length >= 60) return { symbol, timeframe: '1d', candles };
            } catch (e) {}
            return null;
        }));
        for (const res of results) if (res) inputs.push(res);
    }

    // 2. Chấm điểm và lấy Top 5 mã đẹp nhất
    const topList = rankWatchlist(inputs, 5);
    if (topList.length === 0) {
        await sendTelegram("📊 *Báo cáo VN100:* Hôm nay thị trường không có tín hiệu setup đẹp theo bộ lọc.");
        return;
    }

    // 3. Với Top 3 mã đầu bảng, dùng AI để phân tích sâu (nếu có key)
    let reportText = `🏆 *TOP TÍN HIỆU VN100 - ${new Date().toLocaleDateString('vi-VN')}*\n\n`;
    
    for (let i = 0; i < topList.length; i++) {
        const entry = topList[i];
        const price = entry.lastClose.toLocaleString('vi-VN');
        
        reportText += `${i + 1}. *${entry.symbol}* (${entry.score}đ) - Giá: \`${price}\`\n`;
        
        // Chỉ phân tích AI cho Top 3 mã để tiết kiệm token
        if (i < 3 && process.env.ANTHROPIC_API_KEY) {
            const input = inputs.find(inp => inp.symbol === entry.symbol);
            if (input) {
                const zones = computeZones(input.candles);
                const waves = computeWaves(input.candles);
                
                const ai = await analyzeChart({
                    symbol: entry.symbol,
                    timeframe: '1d',
                    candles: input.candles,
                    zones,
                    waves
                });
                
                if (ai.ok && ai.text) {
                    reportText += `📝 _AI Read: ${ai.text}_\n\n`;
                } else {
                    reportText += `• ${entry.reasons[0]}\n\n`;
                }
            } else {
                reportText += `• ${entry.reasons[0]}\n\n`;
            }
        } else {
            reportText += `• ${entry.reasons[0]}\n\n`;
        }
    }

    reportText += `\n_Hệ thống quét tự động lúc 15:15 hàng ngày._`;

    // 4. Gửi qua Telegram
    await sendTelegram(reportText);
    console.log('Đã gửi báo cáo thành công.');
    
    await adapter.close();
}

// Nếu chạy trực tiếp script:
if (process.argv[1].endsWith('daily-report-service.mjs')) {
    // Lập lịch: 15:15 mỗi ngày từ Thứ 2 đến Thứ 6
    console.log('Dịch vụ báo cáo hàng ngày đã sẵn sàng (15:15 T2-T6)');
    cron.schedule('15 15 * * 1-5', () => {
        runDailyReport().catch(console.error);
    });
    
    // Chạy thử ngay lập tức một lần khi khởi động
    runDailyReport().catch(console.error);
}

export { runDailyReport };