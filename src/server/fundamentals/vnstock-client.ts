import { spawn } from "node:child_process";
import path from "node:path";
import type {
  Fundamentals,
  RawFundamentals,
  FinancialStatement,
  Valuation,
} from "./types.js";

/** Typed failure from the python subprocess (non-zero exit, empty/invalid output). */
export class VnstockError extends Error {
  constructor(
    message: string,
    readonly symbol: string,
  ) {
    super(message);
    this.name = "VnstockError";
  }
}

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const SCRIPT_PATH =
  process.env.VNSTOCK_SCRIPT ??
  path.resolve(process.cwd(), "scripts/vnstock-fundamentals.py");

/** Runs the python script and resolves its raw stdout. Injectable for tests. */
export type ScriptRunner = (symbol: string) => Promise<string>;

const defaultRunner: ScriptRunner = (symbol) =>
  new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [SCRIPT_PATH, symbol], {
      timeout: 30_000,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new VnstockError(
            `python exited ${code}: ${stderr.trim() || "no stderr"}`,
            symbol,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Maps one raw statement object, tolerating missing fields → null. */
function mapStatement(s: Partial<FinancialStatement>): FinancialStatement {
  return {
    period: String(s.period ?? ""),
    revenue: num(s.revenue),
    grossProfit: num(s.grossProfit),
    netProfit: num(s.netProfit),
    totalAssets: num(s.totalAssets),
    totalEquity: num(s.totalEquity),
    operatingCashflow: num(s.operatingCashflow),
  };
}

/** Parses + maps the script's raw JSON into domain `Fundamentals`. */
export function mapFundamentals(
  raw: string,
  symbol: string,
  asOf: number,
): Fundamentals {
  let parsed: RawFundamentals;
  try {
    parsed = JSON.parse(raw) as RawFundamentals;
  } catch {
    throw new VnstockError("invalid JSON from python script", symbol);
  }
  if (!parsed || typeof parsed !== "object" || !parsed.valuation) {
    throw new VnstockError("unexpected JSON shape from python script", symbol);
  }

  const v = parsed.valuation;
  const valuation: Valuation = {
    symbol,
    pe: num(v.pe),
    pb: num(v.pb),
    roe: num(v.roe),
    eps: num(v.eps),
    marketCap: num(v.marketCap),
    dividendYield: num(v.dividendYield),
    asOf,
  };
  const statements = Array.isArray(parsed.statements)
    ? parsed.statements.map(mapStatement)
    : [];

  return { valuation, statements };
}

/** Spawns the vnstock script for `symbol`, returns mapped `Fundamentals`. */
export async function fetchFundamentals(
  symbol: string,
  runner: ScriptRunner = defaultRunner,
): Promise<Fundamentals> {
  const sym = symbol.trim().toUpperCase();
  const stdout = await runner(sym);
  if (!stdout.trim()) {
    throw new VnstockError("empty stdout from python script", sym);
  }
  return mapFundamentals(stdout, sym, Date.now());
}
