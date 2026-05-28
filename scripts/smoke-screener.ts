/**
 * Smoke test for the universe screener pipeline (no dev server needed).
 * Run:  pnpm exec tsx scripts/smoke-screener.ts
 */
import { EntradeAdapter } from "../src/server/adapters/entrade-adapter.js";
import { runScreener } from "../src/server/screener/run.js";

const SYMBOLS = ["HPG", "VCB", "FPT", "MWG", "SSI", "VHM", "GAS", "MSN"];

async function main(): Promise<void> {
  const adapter = new EntradeAdapter();
  try {
    const rows = await runScreener(SYMBOLS, (s) =>
      adapter.fetchHistorical({ symbol: s, timeframe: "1d", limit: 400 }),
    );
    console.log(`rows=${rows.length}\n`);
    for (const r of rows) {
      console.log(
        `${r.symbol.padEnd(5)} ★${r.star} score=${String(r.score).padStart(3)} ` +
          `close=${r.close.toFixed(0).padStart(7)} chg=${r.changePct.toFixed(2)}% ` +
          `trend=${r.signals.trend.padEnd(4)} rsi=${r.signals.rsi.toFixed(0)} ` +
          `[BB ${r.blackbox.bbStatus}] reasons=[${r.reasons.join(", ")}]`,
      );
    }
  } finally {
    await adapter.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
