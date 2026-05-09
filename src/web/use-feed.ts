import { useEffect, useRef, useState } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import type { Candle, ClientMessage, ServerMessage, Timeframe } from '../shared/types.js';

interface UseFeedOpts {
  symbol: string;
  timeframe: Timeframe;
}

/**
 * Subscribes to one (symbol, timeframe) feed via the backend WS.
 * Returns the rolling candle array (snapshot + live ticks merged).
 */
export function useFeed({ symbol, timeframe }: UseFeedOpts) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'closed'>('connecting');
  const wsRef = useRef<ReconnectingWebSocket | null>(null);

  useEffect(() => {
    const url = new URL('/ws', window.location.origin);
    url.protocol = url.protocol.replace('http', 'ws');
    const ws = new ReconnectingWebSocket(url.toString(), [], {
      maxRetries: Infinity,
      minReconnectionDelay: 500,
      maxReconnectionDelay: 30_000,
      reconnectionDelayGrowFactor: 1.5,
    });
    wsRef.current = ws;

    const subscribe = () => {
      const msg: ClientMessage = { type: 'subscribe', symbol, timeframe };
      ws.send(JSON.stringify(msg));
    };

    ws.addEventListener('open', () => {
      setStatus('live');
      subscribe();
    });
    ws.addEventListener('close', () => setStatus('closed'));

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;
      if (msg.type === 'snapshot' && msg.symbol === symbol && msg.timeframe === timeframe) {
        setCandles(msg.candles);
      } else if (msg.type === 'tick' && msg.candle.symbol === symbol && msg.candle.timeframe === timeframe) {
        setCandles((prev) => mergeTick(prev, msg.candle));
      }
    });

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [symbol, timeframe]);

  return { candles, status };
}

function mergeTick(prev: Candle[], next: Candle): Candle[] {
  if (prev.length === 0) return [next];
  const last = prev[prev.length - 1];
  if (last.time === next.time) {
    // Same bar — replace in place (live tick updating the open bar).
    return [...prev.slice(0, -1), next];
  }
  if (next.time > last.time) {
    return [...prev, next];
  }
  // Out-of-order or backfill duplicate — drop.
  return prev;
}
