# Phase 02: API Routes

**Priority:** High | **Status:** Todo | **Effort:** Small
**Depends on:** Phase 01

## Files to Modify

- `src/server/index.ts` — add 3 GET routes

## Routes

```
GET /api/market/breadth    → { stocks, breadth, updatedAt }
GET /api/market/liquidity  → { today, yesterday, updatedAt }
GET /api/market/foreign    → { flows, updatedAt }
```

## Implementation

Add after existing routes in `src/server/index.ts`:

```typescript
// Market overview — served from in-memory cache (15s TTL)
fastify.get("/api/market/breadth", async (_req, reply) => {
  const cache = marketDataService.getCache();
  if (!cache) return reply.status(503).send({ error: "warming up" });
  return { stocks: cache.stocks, breadth: cache.breadth, updatedAt: cache.updatedAt };
});

fastify.get("/api/market/liquidity", async (_req, reply) => {
  const cache = marketDataService.getCache();
  if (!cache) return reply.status(503).send({ error: "warming up" });
  return { today: cache.liquidity.today, yesterday: cache.liquidity.yesterday, updatedAt: cache.updatedAt };
});

fastify.get("/api/market/foreign", async (_req, reply) => {
  const cache = marketDataService.getCache();
  if (!cache) return reply.status(503).send({ error: "warming up" });
  return { flows: cache.foreign, updatedAt: cache.updatedAt };
});
```

## Success Criteria

- All 3 routes return 200 with data within 5s of server warm-up
- Return 503 `{ error: "warming up" }` before first poll completes
- No auth required (internal app only)
