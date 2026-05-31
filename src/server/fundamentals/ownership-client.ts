import path from "node:path";
import { spawnPythonJson } from "./python-runner.js";
import type {
  Ownership,
  RawOwnership,
  Shareholder,
  Officer,
  OwnershipStructure,
} from "./ownership-types.js";

/** Typed failure from the ownership python subprocess. */
export class OwnershipError extends Error {
  constructor(
    message: string,
    readonly symbol: string,
  ) {
    super(message);
    this.name = "OwnershipError";
  }
}

const SCRIPT_PATH =
  process.env.OWNERSHIP_SCRIPT ??
  path.resolve(process.cwd(), "scripts/vnstock-ownership.py");

/** Runs the python script and resolves its raw stdout. Injectable for tests. */
export type ScriptRunner = (symbol: string) => Promise<string>;

const defaultRunner: ScriptRunner = async (symbol) => {
  try {
    return await spawnPythonJson(SCRIPT_PATH, symbol);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new OwnershipError(msg, symbol);
  }
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function mapShareholder(s: Partial<Shareholder>): Shareholder {
  return {
    name: str(s.name),
    quantity: num(s.quantity),
    pct: num(s.pct),
    asOf: str(s.asOf),
  };
}

function mapOfficer(o: Partial<Officer>): Officer {
  return {
    name: str(o.name),
    position: str(o.position),
    quantity: num(o.quantity),
    pct: num(o.pct),
  };
}

/** Parses + maps the script's raw JSON into domain `Ownership`. */
export function mapOwnership(
  raw: string,
  symbol: string,
  asOf: number,
): Ownership {
  let parsed: RawOwnership;
  try {
    parsed = JSON.parse(raw) as RawOwnership;
  } catch {
    throw new OwnershipError("invalid JSON from python script", symbol);
  }
  if (!parsed || typeof parsed !== "object" || !parsed.structure) {
    throw new OwnershipError(
      "unexpected JSON shape from python script",
      symbol,
    );
  }

  const s = parsed.structure;
  const structure: OwnershipStructure = {
    foreignPct: num(s.foreignPct),
    statePct: num(s.statePct),
    freeFloatPct: num(s.freeFloatPct),
  };
  const shareholders = Array.isArray(parsed.shareholders)
    ? parsed.shareholders.map(mapShareholder)
    : [];
  const officers = Array.isArray(parsed.officers)
    ? parsed.officers.map(mapOfficer)
    : [];

  return { symbol, structure, shareholders, officers, asOf };
}

/** Spawns the ownership script for `symbol`, returns mapped `Ownership`. */
export async function fetchOwnership(
  symbol: string,
  runner: ScriptRunner = defaultRunner,
): Promise<Ownership> {
  const sym = symbol.trim().toUpperCase();
  const stdout = await runner(sym);
  if (!stdout.trim()) {
    throw new OwnershipError("empty stdout from python script", sym);
  }
  return mapOwnership(stdout, sym, Date.now());
}
