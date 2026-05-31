import type { FastifyInstance } from "fastify";
import { FundamentalsStore } from "./fundamentals-store.js";
import { refreshSymbol, type FundamentalsFetcher } from "./refresh.js";

export interface FundamentalsRouteDeps {
  store: FundamentalsStore;
  ttlSec: number;
  /** Injected for tests; defaults to the live vnstock fetch via refreshSymbol. */
  fetcher?: FundamentalsFetcher;
}

/**
 * `GET /api/fundamentals/:symbol`
 * - fresh cache hit → stored payload
 * - miss/stale → on-demand refresh, then return (works for any opened ticker)
 * - upstream failure: serve stale if present, else 502
 */
const SYMBOL_RE = /^[A-Z0-9.]{1,12}$/;

export function registerFundamentalsRoute(
  fastify: FastifyInstance,
  { store, ttlSec, fetcher }: FundamentalsRouteDeps,
): void {
  // Coalesce concurrent on-demand fetches for the same symbol so a cold symbol
  // spawns one python process, not one per request.
  const inFlight = new Map<string, ReturnType<typeof refreshSymbol>>();

  fastify.get("/api/fundamentals/:symbol", async (req, reply) => {
    const { symbol } = req.params as { symbol: string };
    const sym = symbol.toUpperCase();

    if (!SYMBOL_RE.test(sym)) {
      reply.status(400);
      return { error: "invalid symbol" };
    }

    if (!store.isStale(sym, ttlSec)) {
      const cached = store.get(sym);
      if (cached) return cached;
    }

    try {
      let pending = inFlight.get(sym);
      if (!pending) {
        pending = refreshSymbol(sym, store, fetcher);
        inFlight.set(sym, pending);
        pending.finally(() => inFlight.delete(sym));
      }
      return await pending;
    } catch (err: unknown) {
      const stale = store.get(sym);
      if (stale) return stale; // serve stale on upstream failure
      fastify.log.warn(
        { err },
        `[fundamentals] no data for ${sym} and refresh failed`,
      );
      reply.status(502);
      return { error: "fundamentals unavailable" };
    }
  });
}
