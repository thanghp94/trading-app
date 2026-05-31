import path from "node:path";
import { spawnPythonJson } from "./python-runner.js";
import type {
  CorpActionCalendar,
  CorpEvent,
  RawCorpActions,
} from "./corp-action-types.js";

/** Typed failure from the corp-actions python subprocess. */
export class CorpActionError extends Error {
  constructor(
    message: string,
    readonly symbol: string,
  ) {
    super(message);
    this.name = "CorpActionError";
  }
}

const SCRIPT_PATH =
  process.env.CORP_ACTIONS_SCRIPT ??
  path.resolve(process.cwd(), "scripts/vnstock-corp-actions.py");

/** Runs the python script and resolves its raw stdout. Injectable for tests. */
export type ScriptRunner = (symbol: string) => Promise<string>;

const defaultRunner: ScriptRunner = async (symbol) => {
  try {
    return await spawnPythonJson(SCRIPT_PATH, symbol);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CorpActionError(msg, symbol);
  }
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function mapEvent(e: Partial<CorpEvent>): CorpEvent {
  return {
    code: str(e.code),
    category: str(e.category),
    nameVi: str(e.nameVi),
    nameEn: str(e.nameEn),
    titleVi: str(e.titleVi),
    titleEn: str(e.titleEn),
    date: str(e.date),
    publicDate: str(e.publicDate),
    recordDate: str(e.recordDate),
    exrightDate: str(e.exrightDate),
    payoutDate: str(e.payoutDate),
    valuePerShare: num(e.valuePerShare),
    exerciseRatio: num(e.exerciseRatio),
  };
}

/** Parses + maps the script's raw JSON into a domain `CorpActionCalendar`. */
export function mapCorpActions(
  raw: string,
  symbol: string,
  asOf: number,
): CorpActionCalendar {
  let parsed: RawCorpActions;
  try {
    parsed = JSON.parse(raw) as RawCorpActions;
  } catch {
    throw new CorpActionError("invalid JSON from python script", symbol);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.events)) {
    throw new CorpActionError(
      "unexpected JSON shape from python script",
      symbol,
    );
  }
  return { symbol, events: parsed.events.map(mapEvent), asOf };
}

/** Spawns the corp-actions script for `symbol`, returns the mapped calendar. */
export async function fetchCorpActions(
  symbol: string,
  runner: ScriptRunner = defaultRunner,
): Promise<CorpActionCalendar> {
  const sym = symbol.trim().toUpperCase();
  const stdout = await runner(sym);
  if (!stdout.trim()) {
    throw new CorpActionError("empty stdout from python script", sym);
  }
  return mapCorpActions(stdout, sym, Date.now());
}
