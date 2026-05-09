import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import type { Alert, ClientMessage, ServerMessage } from '../shared/types.js';
import { SymbolManager } from './symbol-manager.js';
import { AlertEngine } from './alerts/alert-engine.js';
import { analyzeChart } from './ai/analyze.js';
import { JournalStore } from './journal/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const AUTH_TOKEN = process.env.APP_AUTH_TOKEN ?? '';

const fastify = Fastify({ logger: true });

await fastify.register(websocket);

const webDist = path.resolve(__dirname, '../web');
try {
  await fastify.register(fastifyStatic, { root: webDist });
} catch {
  fastify.log.info('No built frontend found — running API/WS only (use `pnpm dev:web` for the UI).');
}

const sockets = new Set<{ send: (msg: ServerMessage) => void }>();
const journal = new JournalStore();

const broadcastAlert = (alert: Alert) => {
  const msg: ServerMessage = { type: 'alert', alert };
  for (const s of sockets) s.send(msg);
  // Auto-log every alert as an "open" trade. Idempotent on alert_id.
  try {
    journal.logFromAlert(alert);
  } catch (err) {
    fastify.log.error({ err }, '[journal] log failed');
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

// Journal — list, get, update, stats.
fastify.get('/api/journal', async () => ({ trades: journal.list(), stats: journal.stats() }));
fastify.get('/api/journal/stats', async () => journal.stats());
fastify.patch('/api/journal/:id', async (req) => {
  const { id } = req.params as { id: string };
  return journal.update(id, req.body as Parameters<typeof journal.update>[1]);
});

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
