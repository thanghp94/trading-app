# Phase 01: Server Intraday Route

**Priority:** High | **Status:** Todo | **Effort:** Small

## Files to Modify

- `src/server/index.ts` — add 1 GET route + per-symbol in-memory cache

## Route

```
GET /api/ticker/:symbol/intraday
→ { candles: Candle1m[], updatedAt: number }
  where Candle1m = { time, open, high, low, close, volume }
```

## Implementation

### In-memory cache (add near marketDataService)

```typescript
// Per-symbol 1m intraday cache — refreshed max every 30s
const intradayCache = new Map<string, { candles: IntradayCandle[]; updatedAt: number }>();
const INTRADAY_TTL_MS = 30_000;

interface IntradayCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}
```

### Route handler

```typescript
fastify.get("/api/ticker/:symbol/intraday", async (req, reply) => {
  const { symbol } = req.params as { symbol: string };
  const sym = symbol.toUpperCase();

  const cached = intradayCache.get(sym);
  if (cached && Date.now() - cached.updatedAt < INTRADAY_TTL_MS) {
    return cached;
  }

  const now = Math.floor(Date.now() / 1000);
  // VN session: 02:00 UTC today to now
  const todayStart = now - (now % 86400) + 2 * 3600;
  const url = `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock` +
    `?symbol=${sym}&resolution=1&from=${todayStart}&to=${now}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return reply.status(502).send({ error: "upstream failed" });
    const json = await res.json() as { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
    const isDerivative = /^VN30F/i.test(sym);
    const scale = isDerivative ? 1 : 1000;
    const candles: IntradayCandle[] = (json.t ?? []).map((t, i) => ({
      time: t,
      open:  (json.o[i] ?? 0) * scale,
      high:  (json.h[i] ?? 0) * scale,
      low:   (json.l[i] ?? 0) * scale,
      close: (json.c[i] ?? 0) * scale,
      volume: json.v[i] ?? 0,
    }));
    const entry = { candles, updatedAt: Date.now() };
    intradayCache.set(sym, entry);
    return entry;
  } catch {
    return reply.status(503).send({ error: "fetch failed" });
  }
});
```

## Success Criteria

- `GET /api/ticker/DPG/intraday` returns today's 1m OHLC array during/after market hours
- Cache prevents re-fetching within 30s
- VN equities: prices in full VND (×1000); derivatives: index points (×1)
- Returns 502/503 on upstream failure (not 500)
