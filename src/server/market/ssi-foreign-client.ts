/**
 * Foreign investor flow (khối ngoại) snapshot from SSI iBoard public API.
 * No auth. Each exchange endpoint returns the full board; we sum foreign
 * buy/sell value per exchange. Snapshot only — values are cumulative for the
 * current session, there is no historical series.
 */

const SSI_BASE = "https://iboard-query.ssi.com.vn/stock/exchange";

const EXCHANGES: { path: string; label: string }[] = [
  { path: "hose", label: "HSX" },
  { path: "hnx", label: "HNX" },
  { path: "upcom", label: "UPCOM" },
];

export interface ForeignFlowRow {
  exchange: string; // HSX / HNX / UPCOM
  buyVal: number; // VND billion (tỷ)
  sellVal: number;
  netVal: number;
}

interface SsiStockRow {
  buyForeignValue?: number | null;
  sellForeignValue?: number | null;
}

interface SsiResponse {
  data?: SsiStockRow[];
}

const BILLION = 1e9;

async function fetchExchange(
  path: string,
  label: string,
): Promise<ForeignFlowRow | null> {
  try {
    const res = await fetch(`${SSI_BASE}/${path}`, {
      headers: {
        origin: "https://iboard.ssi.com.vn",
        referer: "https://iboard.ssi.com.vn/",
        "user-agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as SsiResponse;
    const rows = json.data ?? [];

    let buy = 0;
    let sell = 0;
    for (const r of rows) {
      buy += r.buyForeignValue ?? 0;
      sell += r.sellForeignValue ?? 0;
    }

    const buyVal = Math.round(buy / BILLION);
    const sellVal = Math.round(sell / BILLION);
    return { exchange: label, buyVal, sellVal, netVal: buyVal - sellVal };
  } catch {
    return null;
  }
}

/** Fetch foreign flow snapshot for all VN exchanges in parallel. */
export async function fetchForeignFlow(): Promise<ForeignFlowRow[]> {
  const results = await Promise.allSettled(
    EXCHANGES.map(({ path, label }) => fetchExchange(path, label)),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<ForeignFlowRow | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((r): r is ForeignFlowRow => r !== null);
}
