import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import type { ClientMessage, ServerMessage } from '../shared/types.js';
import { SymbolManager } from './symbol-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const AUTH_TOKEN = process.env.APP_AUTH_TOKEN ?? '';

const fastify = Fastify({ logger: true });

await fastify.register(websocket);

// In production, serve the built Vite frontend. In dev, vite handles this.
const webDist = path.resolve(__dirname, '../web');
try {
  await fastify.register(fastifyStatic, { root: webDist });
} catch {
  fastify.log.info('No built frontend found — running API/WS only (use `pnpm dev:web` for the UI).');
}

// Track every connected browser so we can broadcast ticks.
const sockets = new Set<{ send: (msg: ServerMessage) => void }>();

const symbolManager = new SymbolManager(
  (candle) => {
    const msg: ServerMessage = { type: 'tick', candle };
    for (const s of sockets) s.send(msg);
  },
  (err) => fastify.log.error({ err }, 'adapter error'),
);

fastify.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

fastify.register(async (app) => {
  app.get('/ws', { websocket: true }, (socket, req) => {
    // Bearer-token check on the WS handshake. Bypassed if no token configured (dev convenience).
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
        } catch (err) {
          send({ type: 'error', message: (err as Error).message });
        }
      }
      // unsubscribe is intentionally a no-op for W1 — symbol manager keeps streams alive.
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
