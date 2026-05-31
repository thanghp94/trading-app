import type { Fundamentals } from "./types.js";

/** A symbol-keyed JSON cache (FundamentalsStore, OwnershipStore, …). */
export interface SymbolCache<T> {
  set(symbol: string, data: T): void;
}

/** Fetch the payload for one symbol. Injectable for tests. */
export type SymbolFetcher<T> = (symbol: string) => Promise<T>;

/** Back-compat alias for Phase 1 fundamentals callers. */
export type FundamentalsFetcher = SymbolFetcher<Fundamentals>;

export interface RefreshLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const noopLogger: RefreshLogger = { info: () => {}, warn: () => {} };

/** Refresh a single symbol. Throws on fetch failure (caller decides handling). */
export async function refreshSymbol<T>(
  symbol: string,
  store: SymbolCache<T>,
  fetcher: SymbolFetcher<T>,
): Promise<T> {
  const data = await fetcher(symbol);
  store.set(symbol, data);
  return data;
}

/**
 * Refresh a list of symbols sequentially. A failing symbol is logged and skipped
 * — one bad symbol must not abort the batch. Returns counts.
 */
export async function refreshSymbols<T>(
  symbols: string[],
  store: SymbolCache<T>,
  opts: {
    fetcher: SymbolFetcher<T>;
    logger?: RefreshLogger;
    delayMs?: number;
    label?: string;
  },
): Promise<{ ok: number; failed: number }> {
  const { fetcher, logger = noopLogger, delayMs = 300, label = "cache" } = opts;
  let ok = 0;
  let failed = 0;
  for (const sym of symbols) {
    try {
      await refreshSymbol(sym, store, fetcher);
      ok++;
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[${label}] refresh failed for ${sym}: ${msg}`);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  logger.info(
    `[${label}] refresh done: ${ok} ok, ${failed} failed (${symbols.length} total)`,
  );
  return { ok, failed };
}
