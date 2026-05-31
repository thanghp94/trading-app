/**
 * Fetches bulk market data from Entrade (DNSE public chart API) in parallel.
 * No auth required. Rate limit: tested fine at 30+ concurrent requests.
 */

const ENTRADE_BASE = "https://services.entrade.com.vn/chart-api/v2/ohlcs/stock";

interface EntradeOhlc {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export interface StockSnapshot {
  symbol: string;
  sector: string;
  pctChange: number; // % vs yesterday close
  price: number; // latest close (VND)
  refPrice: number; // yesterday close (VND)
  value: number; // today's trading volume (shares) — used for treemap sizing
}

export interface MarketBreadth {
  advance: number;
  decline: number;
  unchanged: number;
}

export interface LiquidityPoint {
  time: number; // unix seconds (minute bucket)
  cumVol: number; // cumulative volume
}

async function fetchOhlc(
  symbol: string,
  resolution: string,
  from: number,
  to: number,
): Promise<EntradeOhlc | null> {
  try {
    const url = `${ENTRADE_BASE}?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as EntradeOhlc;
  } catch {
    return null;
  }
}

/** Fetch 1D OHLC for all symbols in parallel, return snapshots with % change. */
export async function fetchStockSnapshots(
  symbols: string[],
  sectorOf: (sym: string) => string,
): Promise<StockSnapshot[]> {
  const now = Math.floor(Date.now() / 1000);
  // 4 days back covers weekends (we need yesterday's close)
  const from = now - 4 * 86400;

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const data = await fetchOhlc(symbol, "1D", from, now);
      if (!data || data.t.length < 2) return null;

      const n = data.t.length;
      const refPrice = data.c[n - 2]; // yesterday close
      const price = data.c[n - 1]; // today's last
      const volume = data.v[n - 1];

      if (!refPrice || refPrice === 0) return null;

      const pctChange = ((price - refPrice) / refPrice) * 100;

      return {
        symbol,
        sector: sectorOf(symbol),
        pctChange: Math.round(pctChange * 100) / 100,
        price: price * 1000, // Entrade returns thousands VND, convert to VND
        refPrice: refPrice * 1000,
        value: volume,
      } satisfies StockSnapshot;
    }),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<StockSnapshot | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((s): s is StockSnapshot => s !== null);
}

/** Compute advance/decline/unchanged from a snapshot list. */
export function computeBreadth(stocks: StockSnapshot[]): MarketBreadth {
  let advance = 0,
    decline = 0,
    unchanged = 0;
  for (const s of stocks) {
    if (s.pctChange > 0.05) advance++;
    else if (s.pctChange < -0.05) decline++;
    else unchanged++;
  }
  return { advance, decline, unchanged };
}

/**
 * Fetch intraday 1m OHLC for each symbol, sum volumes per minute bucket,
 * then accumulate → cumulative volume curve.
 * Used for the Thanh khoản (liquidity) tab.
 */
export async function fetchCumulativeVolume(
  symbols: string[],
): Promise<LiquidityPoint[]> {
  const now = Math.floor(Date.now() / 1000);
  // VN market open: 09:00 ICT = 02:00 UTC
  const todayStart = now - (now % 86400) + 2 * 3600; // 02:00 UTC today

  const results = await Promise.allSettled(
    symbols.map((sym) => fetchOhlc(sym, "1", todayStart, now)),
  );

  // Sum volume per minute timestamp across all symbols
  const volByMinute = new Map<number, number>();
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { t, v } = r.value;
    for (let i = 0; i < t.length; i++) {
      const min = t[i];
      volByMinute.set(min, (volByMinute.get(min) ?? 0) + v[i]);
    }
  }

  // Sort and accumulate
  const sorted = [...volByMinute.entries()].sort(([a], [b]) => a - b);
  let cumVol = 0;
  return sorted.map(([time, vol]) => {
    cumVol += vol;
    return { time, cumVol };
  });
}

/** Returns the most recent trading day before today — skips weekends. */
function prevTradingDayStart(todayStartUtc: number): number {
  let d = todayStartUtc - 86400;
  // UTC day-of-week: 0=Sun, 6=Sat
  while (true) {
    // Unix epoch 0 was Thursday (4). (4 + days) % 7 → 0=Sun, 6=Sat
    const dayOfWeek = (4 + Math.floor(d / 86400)) % 7;
    if (dayOfWeek !== 0 && dayOfWeek !== 6) break; // not Sun/Sat
    d -= 86400;
  }
  return d;
}

/** Same as fetchCumulativeVolume but for the previous trading session.
 *  Timestamps normalized to today's time axis so the two area series overlay correctly. */
export async function fetchYesterdayCumulativeVolume(
  symbols: string[],
): Promise<LiquidityPoint[]> {
  const now = Math.floor(Date.now() / 1000);
  const todayStart = now - (now % 86400) + 2 * 3600; // 02:00 UTC today
  const yesterdayStart = prevTradingDayStart(todayStart);
  const yesterdayEnd = yesterdayStart + 86400;
  // Offset to shift yesterday's minute timestamps onto today's axis
  const offset = todayStart - yesterdayStart;

  const results = await Promise.allSettled(
    symbols.map((sym) => fetchOhlc(sym, "1", yesterdayStart, yesterdayEnd)),
  );

  const volByMinute = new Map<number, number>();
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { t, v } = r.value;
    for (let i = 0; i < t.length; i++) {
      const normalized = t[i] + offset;
      volByMinute.set(normalized, (volByMinute.get(normalized) ?? 0) + v[i]);
    }
  }

  const sorted = [...volByMinute.entries()].sort(([a], [b]) => a - b);
  let cumVol = 0;
  return sorted.map(([time, vol]) => {
    cumVol += vol;
    return { time, cumVol };
  });
}
