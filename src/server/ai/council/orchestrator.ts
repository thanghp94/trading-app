import type { Timeframe } from '../../../shared/types.js';
import type { AlertEngine } from '../../alerts/alert-engine.js';
import type { CouncilReport, CostLedger, AnalystOutput, RiskVerdict, PMDecision } from './types.js';
import { buildContext } from './context-builder.js';
import { runPrompt } from './anthropic-runner.js';
import { decisionLog } from './decision-log.js';
import {
  analystTechnical, analystFundamental, analystNews, analystSentiment,
  bull, bear, researchManager, trader,
  riskAggressive, riskNeutral, riskConservative, portfolioManager,
  PM_TOOL_NAME, HAIKU_MODEL as HAIKU_MODEL_REF,
} from './agents.js';

const MAX_POSITION_PCT = (() => {
  const v = Number(process.env.COUNCIL_MAX_POSITION_PCT ?? 10);
  return Number.isFinite(v) && v > 0 ? v : 10;
})();

function applyHardGates(pm: PMDecision): { pm: PMDecision; gated: boolean } {
  let gated = false;
  let { action, sizePct } = pm;

  // Gate 1: low confidence → skip trade entirely
  if (pm.confidence === 'low' && action !== 'no_trade') {
    action = 'no_trade';
    sizePct = 0;
    gated = true;
  }

  // Gate 2: no_trade / hold must have zero size
  if ((action === 'no_trade' || action === 'hold') && sizePct !== 0) {
    sizePct = 0;
    gated = true;
  }

  // Gate 3: clamp position size
  if (sizePct > MAX_POSITION_PCT) {
    sizePct = MAX_POSITION_PCT;
    gated = true;
  }

  return { pm: { ...pm, action, sizePct }, gated };
}

// LRU cap: evict oldest entry when map exceeds this
const CACHE_MAX = 50;
const CACHE_TTL_MS = Number(process.env.COUNCIL_CACHE_TTL_MS ?? 4 * 60 * 60 * 1000);

const cache = new Map<string, { report: CouncilReport; expiresAt: number }>();

function cacheKey(symbol: string, tf: string, t: number): string {
  return `${symbol}:${tf}:${t}`;
}

export function clearCouncilCache(): void {
  cache.clear();
}

function ledgerAdd(ledger: CostLedger, entry: CostLedger['entries'][number]): void {
  ledger.entries.push(entry);
  ledger.totalUsd = ledger.entries.reduce((s, e) => s + e.costUsd, 0);
}

function isPMDecision(v: unknown): v is PMDecision {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return (
    ['increase', 'hold', 'decrease', 'no_trade'].includes(d.action as string) &&
    ['low', 'med', 'high'].includes(d.confidence as string) &&
    typeof d.sizePct === 'number' &&
    typeof d.tp === 'number' &&
    typeof d.sl === 'number' &&
    typeof d.rationale === 'string'
  );
}

export type CouncilRequest = { symbol: string; timeframe: Timeframe; alertEngine: AlertEngine };
export type CouncilResult =
  | { ok: true; report: CouncilReport; cached: boolean }
  | { ok: false; error: string };

export async function runCouncil(req: CouncilRequest): Promise<CouncilResult> {
  const ctx = buildContext(req.symbol, req.timeframe, req.alertEngine);
  if (!ctx) return { ok: false, error: `no snapshot for ${req.symbol}:${req.timeframe}` };

  const key = cacheKey(req.symbol, req.timeframe, ctx.lastCandleTime);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { ok: true, report: hit.report, cached: true };

  const ledger: CostLedger = { entries: [], totalUsd: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    // Stage 1: 4 analysts in parallel
    const analystSpecs = [
      { stage: 'analyst-technical' as const, spec: analystTechnical(ctx) },
      { stage: 'analyst-fundamental' as const, spec: analystFundamental(ctx) },
      { stage: 'analyst-news' as const, spec: analystNews(ctx) },
      { stage: 'analyst-sentiment' as const, spec: analystSentiment(ctx) },
    ];
    const analystResults = await Promise.all(
      analystSpecs.map(async ({ stage, spec }) => {
        const r = await runPrompt(spec, stage, controller.signal);
        ledgerAdd(ledger, { stage, model: spec.model, inTok: r.inTok, outTok: r.outTok, costUsd: r.costUsd });
        const out: AnalystOutput = {
          stage,
          text: r.text,
          dataAvailable: !r.text.includes('data unavailable'),
        };
        return out;
      }),
    );

    // Stage 2: bull + bear debate in parallel
    const [bullResult, bearResult] = await Promise.all([
      runPrompt(bull(ctx, analystResults), 'bull', controller.signal),
      runPrompt(bear(ctx, analystResults), 'bear', controller.signal),
    ]);
    ledgerAdd(ledger, { stage: 'bull', model: HAIKU_MODEL_REF, inTok: bullResult.inTok, outTok: bullResult.outTok, costUsd: bullResult.costUsd });
    ledgerAdd(ledger, { stage: 'bear', model: HAIKU_MODEL_REF, inTok: bearResult.inTok, outTok: bearResult.outTok, costUsd: bearResult.costUsd });
    const debate = { bull: bullResult.text, bear: bearResult.text };

    // Stage 3: research manager (sequential)
    const mgrSpec = researchManager(ctx, analystResults, debate);
    const mgrResult = await runPrompt(mgrSpec, 'research-manager', controller.signal);
    ledgerAdd(ledger, { stage: 'research-manager', model: mgrSpec.model, inTok: mgrResult.inTok, outTok: mgrResult.outTok, costUsd: mgrResult.costUsd });

    // Stage 4: trader (sequential)
    const traderSpec = trader(ctx, mgrResult.text);
    const traderResult = await runPrompt(traderSpec, 'trader', controller.signal);
    ledgerAdd(ledger, { stage: 'trader', model: traderSpec.model, inTok: traderResult.inTok, outTok: traderResult.outTok, costUsd: traderResult.costUsd });

    // Stage 5: 3 risk personas in parallel
    const riskRuns = await Promise.all([
      runPrompt(riskAggressive(ctx, traderResult.text), 'risk-aggressive', controller.signal),
      runPrompt(riskNeutral(ctx, traderResult.text), 'risk-neutral', controller.signal),
      runPrompt(riskConservative(ctx, traderResult.text), 'risk-conservative', controller.signal),
    ]);
    const riskStages = ['risk-aggressive', 'risk-neutral', 'risk-conservative'] as const;
    const riskPersonas = ['aggressive', 'neutral', 'conservative'] as const;
    const riskVerdicts: RiskVerdict[] = riskRuns.map((r, i) => {
      ledgerAdd(ledger, { stage: riskStages[i], model: riskAggressive(ctx, '').model, inTok: r.inTok, outTok: r.outTok, costUsd: r.costUsd });
      return { persona: riskPersonas[i], text: r.text };
    });

    // Stage 6: portfolio manager (sequential, Sonnet, tool-use)
    const pmSpec = portfolioManager(ctx, traderResult.text, riskVerdicts);
    const pmResult = await runPrompt(pmSpec, 'portfolio-manager', controller.signal);
    ledgerAdd(ledger, { stage: 'portfolio-manager', model: pmSpec.model, inTok: pmResult.inTok, outTok: pmResult.outTok, costUsd: pmResult.costUsd });

    if (!isPMDecision(pmResult.toolInput)) {
      return { ok: false, error: `portfolio-manager stage failed: tool ${PM_TOOL_NAME} not invoked or bad shape` };
    }
    const rawPm: PMDecision = pmResult.toolInput;
    const rawAction = rawPm.action;
    const { pm, gated } = applyHardGates(rawPm);

    const report: CouncilReport = {
      symbol: req.symbol,
      timeframe: req.timeframe,
      cachedAt: Date.now(),
      analysts: analystResults,
      debate,
      manager: mgrResult.text,
      trader: traderResult.text,
      risk: riskVerdicts,
      pm,
      gated,
      cost: ledger,
    };

    decisionLog.append(report, rawAction);

    // Cache with FIFO eviction if over limit
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, { report, expiresAt: Date.now() + CACHE_TTL_MS });

    return { ok: true, report, cached: false };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

