/**
 * One-shot smoke test: drives the 12 council prompts through `gemini` CLI
 * to validate prompt quality without an ANTHROPIC_API_KEY. Outputs a
 * mock CouncilReport JSON so prompt shape and Gemini compatibility can
 * be eyeballed before committing to a full provider swap.
 *
 * Run: pnpm exec tsx scripts/smoke-council-gemini.ts
 */
import { spawn } from 'node:child_process';
import {
  analystTechnical, analystFundamental, analystNews, analystSentiment,
  bull, bear, researchManager, trader,
  riskAggressive, riskNeutral, riskConservative, portfolioManager,
  PM_TOOL_NAME,
  type PromptSpec,
} from '../src/server/ai/council/agents.js';
import type { CouncilContext, AnalystOutput, RiskVerdict } from '../src/server/ai/council/types.js';
import type { Candle, Zone } from '../src/shared/types.js';

const MODEL = 'gemini-2.5-flash';

function buildFakeContext(): CouncilContext {
  const candles: Candle[] = Array.from({ length: 60 }, (_, i) => {
    const base = 100 + Math.sin(i / 5) * 3 + i * 0.05;
    return {
      time: 1700000000 + i * 300,
      open: base, high: base + 0.5, low: base - 0.5,
      close: base + (Math.random() - 0.5) * 0.3,
      volume: 1000 + Math.random() * 500,
      closed: true,
    };
  });
  const zones: Zone[] = [
    { id: 'z1', top: 105, bottom: 103, type: 'resistance', state: 'active', formedAt: 1700000000, flipped: false, strength: 3 } as Zone,
    { id: 'z2', top: 98, bottom: 96, type: 'support', state: 'active', formedAt: 1700000000, flipped: false, strength: 2 } as Zone,
  ];
  return {
    symbol: 'BTCUSDT',
    timeframe: '5m',
    lastCandleTime: candles[candles.length - 1].time,
    recentCandles: candles,
    zones,
    waves: [{ active: true, direction: 'up', points: [{ label: '0', price: 96, time: 1700000000 }, { label: '1', price: 100, time: 1700001500 }, { label: '2', price: 98, time: 1700003000 }] }],
    mtf: { trend: 'aligned', zone: 'aligned', htf: '15m' },
  };
}

function runGemini(prompt: PromptSpec, isPM = false): Promise<string> {
  const userPrompt = isPM
    ? `${prompt.user}\n\nIMPORTANT: Reply with ONLY a single-line JSON object matching this schema (no markdown fences):\n{"action":"increase|hold|decrease","confidence":"low|med|high","sizePct":0-100,"tp":number,"sl":number,"rationale":"string"}`
    : prompt.user;
  const full = `${prompt.system}\n\n${userPrompt}`;
  return new Promise((resolve, reject) => {
    const proc = spawn('gemini', ['--skip-trust', '-m', MODEL, '-p', full], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`gemini exit ${code}: ${err.slice(-200)}`));
      resolve(out.trim());
    });
  });
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  process.stderr.write(`[smoke] ${label} ...`);
  try {
    const result = await fn();
    process.stderr.write(` ${Date.now() - t0}ms\n`);
    return result;
  } catch (e) {
    process.stderr.write(` FAILED in ${Date.now() - t0}ms\n`);
    throw e;
  }
}

async function main() {
  const ctx = buildFakeContext();

  const [tech, fund, news, sent] = await timed('analysts (4 parallel)', () => Promise.all([
    runGemini(analystTechnical(ctx)),
    runGemini(analystFundamental(ctx)),
    runGemini(analystNews(ctx)),
    runGemini(analystSentiment(ctx)),
  ]));
  const analysts: AnalystOutput[] = [
    { stage: 'analyst-technical', text: tech, notes: '' },
    { stage: 'analyst-fundamental', text: fund, notes: fund.toLowerCase().includes('data unavailable') ? 'data unavailable' : '' },
    { stage: 'analyst-news', text: news, notes: news.toLowerCase().includes('data unavailable') ? 'data unavailable' : '' },
    { stage: 'analyst-sentiment', text: sent, notes: sent.toLowerCase().includes('data unavailable') ? 'data unavailable' : '' },
  ];

  const [bullText, bearText] = await timed('debate (bull+bear parallel)', () => Promise.all([
    runGemini(bull(ctx, analysts)),
    runGemini(bear(ctx, analysts)),
  ]));

  const mgrText = await timed('research manager', () => runGemini(researchManager(ctx, analysts, { bull: bullText, bear: bearText })));
  const tradeProposal = await timed('trader', () => runGemini(trader(ctx, mgrText)));

  const [aggro, neutral, conserv] = await timed('risk (3 parallel)', () => Promise.all([
    runGemini(riskAggressive(ctx, tradeProposal)),
    runGemini(riskNeutral(ctx, tradeProposal)),
    runGemini(riskConservative(ctx, tradeProposal)),
  ]));
  const risk: RiskVerdict[] = [
    { persona: 'aggressive', text: aggro },
    { persona: 'neutral', text: neutral },
    { persona: 'conservative', text: conserv },
  ];

  const pmRaw = await timed('portfolio manager (json mode)', () => runGemini(portfolioManager(ctx, tradeProposal, risk), true));

  let pmJson: unknown = { raw: pmRaw, parseError: 'could not extract JSON' };
  const m = pmRaw.match(/\{[\s\S]*\}/);
  if (m) {
    try { pmJson = JSON.parse(m[0]); } catch (e) { pmJson = { raw: pmRaw, parseError: String(e) }; }
  }

  const report = {
    symbol: ctx.symbol,
    timeframe: ctx.timeframe,
    provider: 'gemini-' + MODEL,
    pmToolName: PM_TOOL_NAME,
    stubMarkers: {
      fundamental: analysts[1].notes === 'data unavailable',
      news: analysts[2].notes === 'data unavailable',
      sentiment: analysts[3].notes === 'data unavailable',
    },
    analysts: analysts.map((a) => ({ stage: a.stage, len: a.text.length, preview: a.text.slice(0, 120) })),
    debate: { bullLen: bullText.length, bearLen: bearText.length, bullPreview: bullText.slice(0, 120), bearPreview: bearText.slice(0, 120) },
    managerPreview: mgrText.slice(0, 150),
    traderPreview: tradeProposal.slice(0, 150),
    risk: risk.map((r) => ({ persona: r.persona, len: r.text.length, preview: r.text.slice(0, 120) })),
    pm: pmJson,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('SMOKE FAIL:', e);
  process.exit(1);
});
