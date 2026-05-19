import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import type { Alert, ClientMessage, ServerMessage, Timeframe } from '../shared/types.js';
import { SymbolManager } from './symbol-manager.js';
import { AlertEngine } from './alerts/alert-engine.js';
import { analyzeChart } from './ai/analyze.js';
import { JournalStore } from './journal/store.js';
import { RiskGuards } from './journal/risk-guards.js';
import { runBacktest, type BacktestRequest } from './backtest/backtest-engine.js';
import { rankWatchlist } from './scanner/watchlist-scanner.js';
import { checkMtf } from '../shared/indicators/mtf.js';
import { SubscriberStore } from './public-feed/subscribers.js';
import { AutoExecutor } from './execution/auto-executor.js';
import { runCouncil } from './ai/council/orchestrator.js';
import cron from 'node-cron';
import { runDailyReport } from '../../scripts/daily-report-service.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const AUTH_TOKEN = process.env.APP_AUTH_TOKEN ?? '';

const fastify = Fastify({ logger: true });

// Lập lịch báo cáo hàng ngày (15:15 Thứ 2 - Thứ 6)
cron.schedule('15 15 * * 1-5', () => {
  fastify.log.info('[cron] Bắt đầu chạy báo cáo Daily Summary...');
  runDailyReport().catch(err => fastify.log.error(err, '[cron] Lỗi chạy báo cáo'));
});

await fastify.register(websocket);

const webDist = path.resolve(__dirname, '../web');
try {
  await fastify.register(fastifyStatic, { root: webDist });
} catch {
  fastify.log.info('No built frontend found — running API/WS only (use `pnpm dev:web` for the UI).');
}

const sockets = new Set<{ send: (msg: ServerMessage) => void }>();
const journal = new JournalStore();
const subscribers = new SubscriberStore();
const autoExecutor = new AutoExecutor();
const riskGuards = new RiskGuards(journal);
fastify.log.info(`[exec] auto-execute mode: ${autoExecutor.getMode()}`);

let telegramBot: any = null;
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  const { TelegramBot } = await import('./alerts/telegram-bot.js');
  telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);
  
  // Khởi động lắng nghe nút bấm Telegram
  telegramBot.startPolling(async (action: string, alertId: string, messageId: number) => {
    if (action === 'ignore') {
      await telegramBot.editMessage(messageId, `❌ *ĐÃ BỎ QUA*\n_Bạn đã hủy lệnh này_`);
      fastify.log.info('[Telegram] User ignored alert');
      return;
    }
    
    if (action === 'exec') {
      // Tìm lại alert trong history
      const history = alertEngine.getHistory();
      const alert = history.find(a => a.id === alertId);
      if (!alert) {
        await telegramBot.editMessage(messageId, `⚠️ *LỖI*\n_Không tìm thấy tín hiệu (có thể server vừa khởi động lại)_`);
        return;
      }

      await telegramBot.editMessage(messageId, `⏳ *ĐANG XỬ LÝ LỆNH MUA...*\n_Mã: ${alert.symbol}_`);
      
      try {
        const order = await autoExecutor.maybeExecute(alert);
        if (order && order.status === 'placed') {
          const modeTxt = autoExecutor.getMode() === 'dry-run' ? '[DRY-RUN/GIẢ LẬP]' : '[LIVE]';
          await telegramBot.editMessage(messageId, `✅ *ĐẶT LỆNH THÀNH CÔNG ${modeTxt}*\n\nMã: *${order.symbol}*\nSL: ${order.quantity}\nCắt lỗ (SL): ${order.sl.toLocaleString('vi-VN')}\nChốt lời (TP): ${order.tp.toLocaleString('vi-VN')}`);
        } else if (order) {
          await telegramBot.editMessage(messageId, `❌ *ĐẶT LỆNH THẤT BẠI*\n\nMã: ${order.symbol}\nLý do: ${order.reason || 'Bị từ chối'}`);
        } else {
          await telegramBot.editMessage(messageId, `❌ *LỆNH BỊ BỎ QUA*\n\nLý do: Không thỏa mãn khối lượng tối thiểu hoặc cấu hình rủi ro.`);
        }
      } catch (err: any) {
        await telegramBot.editMessage(messageId, `⚠️ *LỖI HỆ THỐNG*\n_${err.message}_`);
      }
    }
  });
}

const ANALYZE_ON_ALERT = process.env.ANALYZE_ON_ALERT === 'true';

const broadcastAlert = (alert: Alert) => {
  const blocked = riskGuards.check();
  if (blocked) {
    fastify.log.warn(`[risk] alert suppressed: ${blocked}`);
    // Still broadcast to UI so user sees what was filtered, but tag it.
    const tagged: Alert = { ...alert, headline: `[BLOCKED: ${blocked}] ${alert.headline}` };
    const msg: ServerMessage = { type: 'alert', alert: tagged };
    for (const s of sockets) s.send(msg);
    return;
  }

  // Annotate alert with MTF context...
  try {
    const stream = alertEngine.snapshots().find((s) => s.symbol === alert.symbol && s.timeframe === alert.timeframe);
    if (stream) {
      const entryIdx = stream.candles.findIndex((c) => c.time === alert.time);
      if (entryIdx >= 0) {
        const m = checkMtf({ baseCandles: stream.candles, baseTf: alert.timeframe, entryIdx, direction: alert.direction });
        alert.meta = { ...(alert.meta ?? {}), mtfTrend: m.trend, mtfZone: m.zone, mtfHtf: m.htf };
        const tag = m.trend === 'aligned' && m.zone === 'aligned' ? '✅' : m.trend === 'mismatch' ? '⚠ MTF mismatch' : '';
        if (tag) alert.headline = `${alert.headline} · ${tag}`;
      }
    }
  } catch (err) {
    fastify.log.warn({ err }, '[alerts] mtf check failed');
  }

  const msg: ServerMessage = { type: 'alert', alert };
  for (const s of sockets) s.send(msg);
  
  try {
    journal.logFromAlert(alert);
  } catch (err) {
    fastify.log.error({ err }, '[journal] log failed');
  }

  // Gửi Telegram kèm nút bấm nếu thỏa mãn cấu hình Auto-Execute
  if (telegramBot) {
    const isAllowed = autoExecutor.allowedFor?.(alert) ?? true;
    if (isAllowed) {
      const isDerivative = /^VN30F/i.test(alert.symbol);
      const side = alert.direction === 'bull' ? 'Mua' : 'Bán';
      
      // Chỉ hiện nút Mua cho cổ phiếu VN (trừ phái sinh mới có nút Bán)
      if (isDerivative || alert.direction === 'bull') {
        const buttons = {
          inline_keyboard: [[
            { text: `🚀 Duyệt ${side} ${alert.symbol}`, callback_data: `exec:${alert.id}` },
            { text: '❌ Bỏ qua', callback_data: 'ignore' }
          ]]
        };
        telegramBot.send(alert, buttons).catch((err: any) => fastify.log.error(err, '[Telegram] send failed'));
      } else {
        telegramBot.send(alert).catch((err: any) => fastify.log.error(err, '[Telegram] send failed'));
      }
    }
  }

  // Async AI auto-analyze: fetch the evaluator's recent state and ask Claude
  // for a 5-sentence read. Result is broadcast as an alert-update so any
  // connected client can attach the summary to the alert in their panel.
  if (ANALYZE_ON_ALERT) {
    void (async () => {
      try {
        const snapshots = alertEngine.snapshots();
        const stream = snapshots.find((s) => s.symbol === alert.symbol && s.timeframe === alert.timeframe);
        if (!stream) return;
        const { computeZones } = await import('../shared/indicators/sr-zone-tracker.js');
        const { computeWaves } = await import('../shared/indicators/wave-counter.js');
        const zones = computeZones(stream.candles);
        const waves = computeWaves(stream.candles);
        const ai = await analyzeChart({
          symbol: alert.symbol,
          timeframe: alert.timeframe,
          candles: stream.candles,
          zones,
          waves,
        });
        if (ai.ok && ai.text) {
          const updated: Alert = { ...alert, aiSummary: ai.text };
          const updateMsg: ServerMessage = { type: 'alert', alert: updated };
          for (const s of sockets) s.send(updateMsg);
        }
      } catch (err) {
        fastify.log.error({ err }, '[alerts] auto-analyze failed');
      }
    })();
  }
};

const alertEngine = new AlertEngine(broadcastAlert);

const symbolManager = new SymbolManager(
  (candle) => {
    const msg: ServerMessage = { type: 'tick', candle };
    for (const s of sockets) s.send(msg);
    alertEngine.feed(candle);
  },
  (err) => fastify.log.error({ err }, 'adapter error'),
);

const configured = AlertEngine.parseConfiguredSymbols();
for (const cfg of configured) {
  try {
    const seed = await symbolManager.subscribe(cfg);
    alertEngine.seed(cfg.symbol, cfg.timeframe, seed);
    fastify.log.info(`[alerts] subscribed: ${cfg.symbol} ${cfg.timeframe}`);
  } catch (err) {
    fastify.log.error({ err }, `[alerts] failed to subscribe ${cfg.symbol}:${cfg.timeframe}`);
  }
}

fastify.get('/api/health', async () => ({ ok: true, ts: Date.now() }));
fastify.get('/api/alerts', async () => alertEngine.getHistory());

// AI analyze — proxies to Claude Haiku.
fastify.post('/api/analyze', async (req) => {
  return analyzeChart(req.body as Parameters<typeof analyzeChart>[0]);
});

// AI Trading Council — multi-agent pipeline (Haiku × 11 + Sonnet × 1, ~$0.03-0.05/call).
// Gate: disabled unless COUNCIL_ENABLED=true in env. Returns 404 when off.
if (process.env.COUNCIL_ENABLED === 'true') {
  fastify.post('/api/council', async (req) => {
    const { symbol, timeframe } = req.body as { symbol: string; timeframe: Timeframe };
    if (typeof symbol !== 'string' || !symbol) return { ok: false, error: 'symbol required' };
    const allowed = ['1m', '5m', '15m', '1h', '4h', '1d'];
    if (!allowed.includes(timeframe)) return { ok: false, error: `timeframe must be one of ${allowed.join(',')}` };
    return runCouncil({ symbol, timeframe, alertEngine });
  });
}

// Journal — list, get, update, stats, csv.
fastify.get('/api/journal', async () => ({ trades: journal.list(), stats: journal.stats() }));
fastify.get('/api/journal/stats', async () => journal.stats());
fastify.patch('/api/journal/:id', async (req) => {
  const { id } = req.params as { id: string };
  return journal.update(id, req.body as Parameters<typeof journal.update>[1]);
});
fastify.get('/api/journal/csv', async (_req, reply) => {
  const trades = journal.list(10_000);
  const header = 'id,alert_id,symbol,timeframe,direction,rule,entry_price,sl,tp,exit_price,outcome,r_multiple,notes,opened_at,closed_at\n';
  const csvEscape = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = trades
    .map((t) =>
      [t.id, t.alert_id, t.symbol, t.timeframe, t.direction, t.rule, t.entry_price, t.sl, t.tp, t.exit_price, t.outcome, t.r_multiple, t.notes, t.opened_at, t.closed_at]
        .map(csvEscape)
        .join(','),
    )
    .join('\n');
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="journal-${Date.now()}.csv"`);
  return header + rows;
});

// Backtest — replay rules + simulate trades against any candle history.
fastify.post('/api/backtest', async (req) => runBacktest(req.body as BacktestRequest));

// VN backtest — server-side DNSE data fetch + backtest. No candles in body needed.
fastify.post('/api/backtest/vn', async (req, reply) => {
  if (!process.env.DNSE_API_KEY || !process.env.DNSE_API_SECRET) {
    reply.status(400);
    return { error: 'DNSE_API_KEY and DNSE_API_SECRET not configured in .env' };
  }
  const { DnseAdapter } = await import('./adapters/dnse-adapter.js');
  const body = req.body as {
    symbol: string;
    timeframe: Timeframe;
    fromDate?: string; // YYYY-MM-DD
    toDate?: string;
    slMode?: string;
    slPct?: number;
    tpMode?: string;
    rrTarget?: number;
    maxBars?: number;
    riskPct?: number;
    startingBalance?: number;
    preferredOnly?: boolean;
    mtfTrendAlign?: boolean;
    mtfZoneConfluence?: boolean;
  };
  const toSec = body.toDate ? Math.floor(new Date(body.toDate).getTime() / 1000) + 86400 : Math.floor(Date.now() / 1000);
  const fromSec = body.fromDate
    ? Math.floor(new Date(body.fromDate).getTime() / 1000)
    : toSec - 365 * 86400;

  const adapter = new DnseAdapter(process.env.DNSE_API_KEY, process.env.DNSE_API_SECRET);
  try {
    const candles = await adapter.fetchHistorical({
      symbol: body.symbol,
      timeframe: body.timeframe,
      limit: 50_000,
      sinceSec: fromSec,
    });
    // Trim to requested window
    const filtered = candles.filter((c) => c.time >= fromSec && c.time <= toSec);
    if (filtered.length < 50) {
      reply.status(400);
      return { error: `Only ${filtered.length} candles in range — too few to backtest.` };
    }
    return runBacktest({
      symbol: body.symbol,
      timeframe: body.timeframe,
      candles: filtered,
      slMode: (body.slMode ?? 'trigger-wick') as BacktestRequest['slMode'],
      slPct: body.slPct ?? 0.005,
      tpMode: (body.tpMode ?? 'next-resistance') as BacktestRequest['tpMode'],
      rrTarget: body.rrTarget ?? 2,
      maxBars: body.maxBars ?? 30,
      riskPct: body.riskPct ?? 1,
      startingBalance: body.startingBalance ?? 10_000,
      preferredOnly: body.preferredOnly ?? false,
      mtfTrendAlign: body.mtfTrendAlign ?? false,
      mtfZoneConfluence: body.mtfZoneConfluence ?? false,
    });
  } finally {
    await adapter.close();
  }
});

// Watchlist scanner — score every active stream, return top setups.
fastify.get('/api/scan', async () => {
  const inputs = alertEngine.snapshots();
  return rankWatchlist(inputs, 30);
});

// Public alert feed — subscriber management + read endpoint.
fastify.get('/api/subscribers', async () => subscribers.list());
fastify.post('/api/subscribers', async (req) => {
  const body = req.body as { name?: string; symbols?: string; rules?: string; rateLimit?: number };
  if (!body.name) throw new Error('name required');
  return subscribers.create(body.name, body);
});
fastify.delete('/api/subscribers/:token', async (req) => {
  const { token } = req.params as { token: string };
  subscribers.delete(token);
  return { ok: true };
});
fastify.get('/api/public/alerts', async (req, reply) => {
  const token = (req.query as { token?: string } | undefined)?.token ?? '';
  if (!token) {
    reply.code(401);
    return { error: 'token required' };
  }
  const sub = subscribers.get(token);
  if (!sub) {
    reply.code(403);
    return { error: 'invalid token' };
  }
  // Filter the in-memory alert history through the subscriber's rules.
  // We call consume() for each alert delivered so quotas are accurate.
  const all = alertEngine.getHistory();
  const out: Alert[] = [];
  for (const a of all) {
    if (subscribers.consume(token, a)) out.push(a);
  }
  return { name: sub.name, count: out.length, alerts: out };
});

// Auto-execution status + history (read-only).
fastify.get('/api/execution/mode', async () => ({ mode: autoExecutor.getMode() }));
fastify.get('/api/execution/history', async () => autoExecutor.getHistory());

fastify.register(async (app) => {
  app.get('/ws', { websocket: true }, (socket, req) => {
    if (AUTH_TOKEN) {
      const provided = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
      const fromQuery = (req.query as { token?: string } | undefined)?.token ?? '';
      if (provided !== AUTH_TOKEN && fromQuery !== AUTH_TOKEN) {
        socket.close(1008, 'unauthorized');
        return;
      }
    }

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const handle = { send };
    sockets.add(handle);

    send({ type: 'alert-history', alerts: alertEngine.getHistory() });

    socket.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        send({ type: 'error', message: 'bad JSON' });
        return;
      }
      if (msg.type === 'subscribe') {
        try {
          const candles = await symbolManager.subscribe({ symbol: msg.symbol, timeframe: msg.timeframe });
          send({ type: 'snapshot', symbol: msg.symbol, timeframe: msg.timeframe, candles });
          alertEngine.seed(msg.symbol, msg.timeframe, candles);
        } catch (err) {
          send({ type: 'error', message: (err as Error).message });
        }
      }
    });

    socket.on('close', () => {
      sockets.delete(handle);
    });
  });
});

const shutdown = async () => {
  await symbolManager.closeAll();
  await fastify.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
