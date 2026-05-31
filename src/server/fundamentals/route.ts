import type { FastifyInstance } from "fastify";
import {
  refreshSymbol,
  type SymbolCache,
  type SymbolFetcher,
} from "./refresh.js";

/** Read+write symbol cache backing a cache-or-fetch route. */
export interface ReadableSymbolCache<T> extends SymbolCache<T> {
  get(symbol: string): T | null;
  isStale(symbol: string, ttlSec: number): boolean;
}

export interface SymbolCacheRouteDeps<T> {
  /** Route path, e.g. "/api/fundamentals/:symbol". */
  path: string;
  store: ReadableSymbolCache<T>;
  ttlSec: number;
  fetcher: SymbolFetcher<T>;
  /** Log/label prefix, e.g. "fundamentals". */
  label: string;
}

const SYMBOL_RE = /^[A-Z0-9.]{1,12}$/;

/**
 * Registers `GET <path>` backed by a symbol cache:
 * - fresh cache hit → stored payload
 * - miss/stale → on-demand refresh (concurrent identical requests coalesced)
 * - upstream failure: serve stale if present, else 502
 */
export function registerSymbolCacheRoute<T>(
  fastify: FastifyInstance,
  { path, store, ttlSec, fetcher, label }: SymbolCacheRouteDeps<T>,
): void {
  const inFlight = new Map<string, Promise<T>>();

  fastify.get(path, async (req, reply) => {
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

    let pending = inFlight.get(sym);
    const initiated = !pending;
    if (!pending) {
      pending = refreshSymbol(sym, store, fetcher);
      inFlight.set(sym, pending);
    }
    try {
      return await pending;
    } catch (err: unknown) {
      const stale = store.get(sym);
      if (stale) return stale; // serve stale on upstream failure
      fastify.log.warn(
        { err },
        `[${label}] no data for ${sym} and refresh failed`,
      );
      reply.status(502);
      return { error: `${label} unavailable` };
    } finally {
      if (initiated) inFlight.delete(sym);
    }
  });
}
