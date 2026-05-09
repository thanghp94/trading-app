import { useEffect, useRef, useState } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import type { Alert, ServerMessage } from '../shared/types.js';

const STORAGE_KEY = 'trading-app:alerts-v1';
const MAX_KEEP = 100;

/**
 * Single global WS connection that listens only for alert / alert-history
 * messages and ignores tick / snapshot (those are handled by per-cell
 * useFeed). Stores recent alerts in localStorage so they survive reload
 * even before the server backfills its history.
 */
export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Alert[];
    } catch {
      /* ignore */
    }
    return [];
  });
  const wsRef = useRef<ReconnectingWebSocket | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts.slice(-MAX_KEEP)));
    } catch {
      /* quota — non-fatal */
    }
  }, [alerts]);

  useEffect(() => {
    const url = new URL('/ws', window.location.origin);
    url.protocol = url.protocol.replace('http', 'ws');
    const ws = new ReconnectingWebSocket(url.toString(), [], {
      maxRetries: Infinity,
      minReconnectionDelay: 500,
      maxReconnectionDelay: 30_000,
    });
    wsRef.current = ws;

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;
      if (msg.type === 'alert') {
        setAlerts((prev) => mergeAlerts(prev, [msg.alert]));
      } else if (msg.type === 'alert-history') {
        setAlerts((prev) => mergeAlerts(prev, msg.alerts));
      }
    });

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const clearAlerts = () => setAlerts([]);

  return { alerts, clearAlerts };
}

function mergeAlerts(prev: Alert[], next: Alert[]): Alert[] {
  const seen = new Set(prev.map((a) => a.id));
  const merged = [...prev];
  for (const a of next) {
    if (seen.has(a.id)) continue;
    merged.push(a);
    seen.add(a.id);
  }
  merged.sort((a, b) => a.time - b.time);
  return merged.slice(-MAX_KEEP);
}
