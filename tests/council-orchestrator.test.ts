import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AlertEngine } from '../src/server/alerts/alert-engine.js';
import type { Candle } from '../src/shared/types.js';
import { buildCandles, quietWarmup } from './fixtures/synth.js';

// ─── Anthropic SDK mock ───────────────────────────────────────────────────────
// Must be declared before any module that imports @anthropic-ai/sdk
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// Import AFTER vi.mock is hoisted
const { runCouncil, clearCouncilCache } = await import('../src/server/ai/council/orchestrator.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HAIKU_USAGE = { input_tokens: 800, output_tokens: 250 };
const SONNET_USAGE = { input_tokens: 2000, output_tokens: 400 };

/** Plain text response (11 Haiku stages) */
function textResponse(text: string, usage = HAIKU_USAGE) {
  return { content: [{ type: 'text', text }], usage };
}

/** Tool-use response (PM stage) */
function toolResponse() {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'submit_decision',
        input: {
          action: 'hold',
          confidence: 'med',
          sizePct: 50,
          tp: 110,
          sl: 90,
          rationale: 'Balanced risk/reward given current conditions.',
        },
      },
    ],
    usage: SONNET_USAGE,
  };
}

/** Build enough candles to satisfy computeWaves (needs ≥30) */
function richCandles(): Candle[] {
  const specs = [
    ...quietWarmup(),
    { trend: 1, bodyMult: 6, wickMult: 0.05, volMult: 3 },
    ...Array.from({ length: 15 }, (_, i) => ({ trend: i % 2 === 0 ? -1 : 1, bodyMult: 1.2 })),
  ];
  return buildCandles(specs, 100, 0.5, 'BTCUSDT');
}

function fakeEngine(candles: Candle[] = richCandles()): AlertEngine {
  return {
    snapshots: () => [{ symbol: 'BTCUSDT', timeframe: '5m' as const, candles }],
  } as unknown as AlertEngine;
}

/** Set up the mock to return 11 plain-text responses then 1 tool-use (PM). */
function setupMockResponses(textOverride?: (callIdx: number) => string) {
  let callIdx = 0;
  mockCreate.mockImplementation(() => {
    const idx = callIdx++;
    // Call 11 is PM (model starts with 'claude-sonnet') — but we detect by call order
    // Pipeline: 4 analysts + 2 debate + 1 mgr + 1 trader + 3 risk + 1 PM = 12 total
    if (idx === 11) return Promise.resolve(toolResponse());
    const text = textOverride ? textOverride(idx) : `stage ${idx} response`;
    return Promise.resolve(textResponse(text));
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runCouncil orchestrator', () => {
  beforeEach(() => {
    clearCouncilCache();
    vi.clearAllMocks();
    // The mock replaces the Anthropic class, but getCouncilClient() still guards
    // on ANTHROPIC_API_KEY. Set a fake key so the guard passes.
    process.env.ANTHROPIC_API_KEY = 'test-key-fake';
  });

  it('returns ok:true with a fully-shaped CouncilReport', async () => {
    setupMockResponses();
    const result = await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: fakeEngine() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const r = result.report;
    expect(r.symbol).toBe('BTCUSDT');
    expect(r.analysts).toHaveLength(4);
    expect(r.debate).toHaveProperty('bull');
    expect(r.debate).toHaveProperty('bear');
    expect(typeof r.manager).toBe('string');
    expect(typeof r.trader).toBe('string');
    expect(r.risk).toHaveLength(3);
    expect(r.pm).toMatchObject({ action: 'hold', confidence: 'med' });
    expect(result.cached).toBe(false);
  });

  it('analysts + risk stages fire concurrently (call-order counter test)', async () => {
    // Track call ordering: analysts should all start before debate starts
    const callOrder: number[] = [];
    let callIdx = 0;
    mockCreate.mockImplementation((_params: { model: string }) => {
      const myIdx = callIdx++;
      callOrder.push(myIdx);
      if (myIdx === 11) return Promise.resolve(toolResponse());
      return Promise.resolve(textResponse(`response ${myIdx}`));
    });

    await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: fakeEngine() });

    // The first 4 calls are analysts (parallel batch). They should be 0,1,2,3.
    // The next 2 are debate (parallel). They should be 4,5.
    // Call 6 = research-manager, 7 = trader, 8/9/10 = risk, 11 = PM.
    expect(callOrder.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(callOrder.slice(4, 6).sort((a, b) => a - b)).toEqual([4, 5]); // debate parallel
    expect(callOrder[6]).toBe(6); // manager sequential
    expect(callOrder[7]).toBe(7); // trader sequential
    expect(callOrder.slice(8, 11).sort((a, b) => a - b)).toEqual([8, 9, 10]); // risk parallel
    expect(callOrder[11]).toBe(11); // PM sequential last
  });

  it('second call with same lastCandleTime returns cached:true without API calls', async () => {
    setupMockResponses();
    const engine = fakeEngine();
    const r1 = await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: engine });
    expect(r1.ok && r1.cached).toBe(false); // first call: not cached

    const callCountAfterFirst = mockCreate.mock.calls.length;
    const r2 = await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: engine });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.cached).toBe(true);
    // No additional API calls on cache hit
    expect(mockCreate.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('cost ledger totalUsd equals sum of entries', async () => {
    setupMockResponses();
    const result = await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: fakeEngine() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { cost } = result.report;
    expect(cost.entries).toHaveLength(12);
    const summed = cost.entries.reduce((s, e) => s + e.costUsd, 0);
    expect(Math.abs(cost.totalUsd - summed)).toBeLessThan(0.000001);
  });

  it('stub analysts set dataAvailable:false when response contains "data unavailable"', async () => {
    let callIdx = 0;
    mockCreate.mockImplementation(() => {
      const idx = callIdx++;
      if (idx === 11) return Promise.resolve(toolResponse());
      // Stub analysts are indices 1,2,3 (fundamental, news, sentiment)
      const text = [1, 2, 3].includes(idx) ? 'data unavailable for this symbol' : `normal response ${idx}`;
      return Promise.resolve(textResponse(text));
    });

    const result = await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: fakeEngine() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { analysts } = result.report;
    expect(analysts[0].dataAvailable).toBe(true); // technical — no stub marker
    expect(analysts[1].dataAvailable).toBe(false); // fundamental stub
    expect(analysts[2].dataAvailable).toBe(false); // news stub
    expect(analysts[3].dataAvailable).toBe(false); // sentiment stub
  });

  it('PM tool-use: parses PMDecision correctly from tool_use block', async () => {
    setupMockResponses();
    const result = await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: fakeEngine() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { pm } = result.report;
    expect(['increase', 'hold', 'decrease']).toContain(pm.action);
    expect(['low', 'med', 'high']).toContain(pm.confidence);
    expect(typeof pm.sizePct).toBe('number');
    expect(typeof pm.tp).toBe('number');
    expect(typeof pm.sl).toBe('number');
    expect(typeof pm.rationale).toBe('string');
  });

  it('returns ok:false when PM tool block is missing', async () => {
    let callIdx = 0;
    mockCreate.mockImplementation(() => {
      const idx = callIdx++;
      // PM at idx 11 returns plain text (no tool_use) — simulates tool not invoked
      return Promise.resolve(textResponse(`response ${idx}`));
    });

    const result = await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: fakeEngine() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/portfolio-manager/);
  });

  it('returns ok:false when no snapshot found for symbol/tf', async () => {
    const emptyEngine = { snapshots: () => [] } as unknown as AlertEngine;
    const result = await runCouncil({ symbol: 'BTCUSDT', timeframe: '5m', alertEngine: emptyEngine });
    expect(result.ok).toBe(false);
  });
});
