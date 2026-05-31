import type { Fundamentals } from "./types.js";
import { FundamentalsStore } from "./fundamentals-store.js";
import { fetchFundamentals } from "./vnstock-client.js";

/** Fetch one symbol and write it to the store. Source injectable for tests. */
export type FundamentalsFetcher = (symbol: string) => Promise<Fundamentals>;

export interface RefreshLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const noopLogger: RefreshLogger = { info: () => {}, warn: () => {} };

/** Refresh a single symbol. Throws on fetch failure (caller decides handling). */
export async function refreshSymbol(
  symbol: string,
  store: FundamentalsStore,
  fetcher: FundamentalsFetcher = fetchFundamentals,
): Promise<Fundamentals> {
  const data = await fetcher(symbol);
  store.set(symbol, data);
  return data;
}

/**
 * Refresh a list of symbols sequentially. A failing symbol is logged and skipped
 * — one bad symbol must not abort the batch. Returns counts.
 */
export async function refreshSymbols(
  symbols: string[],
  store: FundamentalsStore,
  opts: {
    fetcher?: FundamentalsFetcher;
    logger?: RefreshLogger;
    delayMs?: number;
  } = {},
): Promise<{ ok: number; failed: number }> {
  const {
    fetcher = fetchFundamentals,
    logger = noopLogger,
    delayMs = 300,
  } = opts;
  let ok = 0;
  let failed = 0;
  for (const sym of symbols) {
    try {
      await refreshSymbol(sym, store, fetcher);
      ok++;
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[fundamentals] refresh failed for ${sym}: ${msg}`);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  logger.info(
    `[fundamentals] refresh done: ${ok} ok, ${failed} failed (${symbols.length} total)`,
  );
  return { ok, failed };
}
