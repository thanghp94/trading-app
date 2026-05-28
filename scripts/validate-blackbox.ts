/**
 * Blackbox proxy validation harness (Phase 01 GATE).
 *
 * Fetches real daily OHLCV for a few liquid VN symbols, computes the blackbox
 * proxy, and checks whether "Uốn lên" (money oscillator turning up from a low
 * zone) precedes up-moves more than chance. If the edge ≈ 0, the OHLCV proxy is
 * noise → revisit before building the store/UI or buying data.
 *
 * Run:  pnpm exec tsx scripts/validate-blackbox.ts
 */
import { EntradeAdapter } from "../src/server/adapters/entrade-adapter.js";
import { computeBlackbox } from "../src/shared/blackbox/compute.js";
import type { Candle } from "../src/shared/types.js";

const SYMBOLS = ["HPG", "VCB", "FPT", "MWG", "SSI"];
const FWD = 10; // forward horizon (bars) to measure outcome
const BARS = 1400; // ~5.5y daily, reaches back toward 2021 anchor

/** Detect every bar where `s` makes a trough below `threshold` then turns up. */
function uonUpEvents(s: number[], threshold: number): number[] {
  const idx: number[] = [];
  for (let i = 2; i < s.length; i += 1) {
    const [a, b, c] = [s[i - 2], s[i - 1], s[i]];
    if (![a, b, c].every(Number.isFinite)) continue;
    if (b <= a && c > b && b < threshold) idx.push(i);
  }
  return idx;
}

function fwdReturn(candles: Candle[], i: number, n: number): number | null {
  if (i + n >= candles.length) return null;
  const a = candles[i].close;
  const b = candles[i + n].close;
  return a > 0 ? (b - a) / a : null;
}

function intersect(a: number[], b: number[]): number[] {
  const set = new Set(b);
  return a.filter((i) => set.has(i));
}

const HORIZONS = [3, 5, 10];

interface Acc {
  sig: Record<number, { sum: number; n: number }>;
  base: Record<number, { sum: number; n: number }>;
}

function newAcc(): Acc {
  const sig: Acc["sig"] = {};
  const base: Acc["base"] = {};
  for (const h of HORIZONS) {
    sig[h] = { sum: 0, n: 0 };
    base[h] = { sum: 0, n: 0 };
  }
  return { sig, base };
}

async function main(): Promise<void> {
  const adapter = new EntradeAdapter();

  // signal variants → accumulator
  const variants: Record<string, Acc> = {
    "uon-c3-30": newAcc(),
    "uon-c3-20": newAcc(),
    "uon-c20-30": newAcc(),
    "conf-c3&c5&c10": newAcc(),
    "uon-c5-30 + DSPI>0": newAcc(),
  };
  const base = newAcc();

  for (const symbol of SYMBOLS) {
    const candles = await adapter.fetchHistorical({
      symbol,
      timeframe: "1d",
      limit: BARS,
    });
    if (candles.length < 250) {
      console.log(`${symbol}: only ${candles.length} bars — skipping`);
      continue;
    }
    const bb = computeBlackbox(candles);
    const last = bb.tmc.length - 1;
    console.log(
      `${symbol}  TMC=${bb.tmc[last].toFixed(3)}  BB=${bb.bbStatus}  Cầu=${bb.xhCau}  DSPI=${bb.dspi[last]?.toFixed(2)}`,
    );

    for (const h of HORIZONS) {
      for (let i = 0; i < candles.length; i += 1) {
        const r = fwdReturn(candles, i, h);
        if (r != null) {
          base.base[h].sum += r;
          base.base[h].n += 1;
        }
      }
    }

    const eventSets: Record<string, number[]> = {
      "uon-c3-30": uonUpEvents(bb.cycles[3].chdm, 30),
      "uon-c3-20": uonUpEvents(bb.cycles[3].chdm, 20),
      "uon-c20-30": uonUpEvents(bb.cycles[20].chdm, 30),
      "conf-c3&c5&c10": intersect(
        intersect(
          uonUpEvents(bb.cycles[3].chdm, 30),
          uonUpEvents(bb.cycles[5].chdm, 40),
        ),
        uonUpEvents(bb.cycles[10].chdm, 50),
      ),
      "uon-c5-30 + DSPI>0": uonUpEvents(bb.cycles[5].chdm, 30).filter(
        (i) => Number.isFinite(bb.dspi[i]) && bb.dspi[i] > 0,
      ),
    };

    for (const [name, events] of Object.entries(eventSets)) {
      for (const i of events) {
        for (const h of HORIZONS) {
          const r = fwdReturn(candles, i, h);
          if (r != null) {
            variants[name].sig[h].sum += r;
            variants[name].sig[h].n += 1;
          }
        }
      }
    }
  }

  console.log(`\n──── EDGE SWEEP (signal avg − baseline avg, pts) ────`);
  const pct = (x: { sum: number; n: number }) =>
    x.n ? (x.sum / x.n) * 100 : NaN;
  console.log(
    `baseline fwd: ` +
      HORIZONS.map((h) => `${h}d=${pct(base.base[h]).toFixed(2)}%`).join("  "),
  );
  for (const [name, acc] of Object.entries(variants)) {
    const cells = HORIZONS.map((h) => {
      const edge = pct(acc.sig[h]) - pct(base.base[h]);
      return `${h}d ${edge >= 0 ? "+" : ""}${edge.toFixed(2)} (n=${acc.sig[h].n})`;
    });
    console.log(`${name.padEnd(20)} ${cells.join("   ")}`);
  }

  await adapter.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
