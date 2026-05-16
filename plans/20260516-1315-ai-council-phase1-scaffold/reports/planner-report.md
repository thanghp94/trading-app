# Planner Report — AI Council Phase 1 Scaffold

Date: 2026-05-16
Branch: feat/alerts-dedup-trailing-sl

## What I Checked

- `src/server/ai/analyze.ts` — single-agent Haiku pattern. Lazy `getClient()` (lines 21-26), cost calc `inTok/1M * 0.8 + outTok/1M * 4` (line 91), model ID `claude-haiku-4-5-20251001` (line 80). Reusable verbatim.
- `src/server/index.ts:172-175` — `/api/analyze` route shape: `fastify.post('/api/analyze', async (req) => analyzeChart(req.body as ...))`. Mirror exactly with feature gate.
- `src/server/alerts/alert-engine.ts:36-42` — `snapshots()` returns `Array<{symbol, timeframe, candles}>`. Single source of council inputs.
- `src/shared/indicators/sr-zone-tracker.ts:35` — `computeZones(candles, opts?)` — pure, recomputes from scratch. Fine for Phase 1 cost.
- `src/shared/indicators/mtf.ts:46` — `checkMtf({baseCandles, baseTf, entryIdx, direction})`. Needs direction → defaulted to active wave's direction.
- `src/shared/indicators/wave-counter.ts` — exports `WaveCount`, `WavePoint`. Exact `computeWaves` name to confirm at impl time.
- `.env.example:45-48` — Anthropic block exists; `COUNCIL_ENABLED` slots in cleanly below.
- `tests/alert-dedup.test.ts` — vitest pattern (`describe`/`it`/`expect`). `vitest.config.ts` includes `tests/**/*.{test,spec}.{ts,tsx}`.
- `package.json` — `@anthropic-ai/sdk` already present (used by `analyze.ts`). No new deps required.

## Key Gotchas

- **Sonnet 4.6 model ID** — exact string not in repo. Best guess `claude-sonnet-4-6-20251001` (parallel to Haiku ID). Verify against Anthropic docs before Phase 03 merge; failing call surfaces fast in tests.
- **Tool-use parsing shape** — Anthropic SDK returns mixed `content[]` blocks; PM result needs `block.type === 'tool_use'` type guard, then read `block.input`. If missing → orchestrator must fail explicitly, not silently fall back.
- **MTF direction outside an alert** — council fires on-demand without a triggering alert. Direction defaulted to active wave's direction; if no active wave, `mtf = null`. Documented in Phase 02.
- **`"data unavailable"` enforcement** — purely prompt-side discipline in Phase 1. Validators check substring match. If model fabricates anyway, we accept the leak — Phase 2 adds real data sources.
- **Cache key includes `lastCandleTime`** — natural invalidation on new bar; TTL only catches the no-new-bar case.
- **Concurrency burst** — 4 parallel + 3 parallel calls may trip Anthropic rate limits on heavy users; accept for Phase 1, monitor.
- **Endpoint auth** — `APP_AUTH_TOKEN` enforcement on `/api/*` not re-verified in this pass; flagged in Phase 04 security section.
- **File LOC ceilings** — `agents.ts` is the tightest squeeze (12 builders + helper). Plan extracts shared context-snippet builder; if still tight, split into `agents-analysts.ts` + `agents-decision.ts` (deferred).
- **AutoExecutor coupling forbidden in Phase 1** — `PMDecision.action` is advisory text only; no import path from `auto-executor.ts` to council code.
- **Council MUST NOT auto-fire on alerts** — only via `POST /api/council`. AlertEngine has no awareness of council module.

## Phase Effort Recap

- Phase 01 (types + 12 prompts): 3h
- Phase 02 (context builder): 2h
- Phase 03 (orchestrator + cache): 4h
- Phase 04 (endpoint + tests + env): 2h
- **Total: 11h**

## Per-Pipeline Cost Estimate

~$0.035 per cache-miss call (11 Haiku ≈ $0.022 + 1 Sonnet ≈ $0.012). Cache hits free. Document in `.env.example` block.

## Unresolved Questions

1. **Sonnet 4.6 exact model ID** — confirm `claude-sonnet-4-6-20251001` vs alternatives before implementation.
2. **Auth coverage on `/api/council`** — does Fastify auth hook applied to `/api/analyze` also apply to `/api/council`? Verify in Phase 04 step 1; if not, add hook or document gap.
3. **`computeWaves` export name** — confirm exact name in `wave-counter.ts` (may be `WaveCounter` class with `compute()` method instead). Resolves at Phase 02 step 1.
4. **Concurrency rate-limit posture** — should orchestrator add a semaphore (e.g., max 4 in-flight) for Anthropic on cheap tiers? Deferred unless observed 429s.
5. **PM tool schema source of truth** — keep schema inline in `agents.ts`, or generate from TS type via a build step? Phase 1 inlines; Phase 2 may revisit if drift bites.
6. **Endpoint body validation** — no zod/fastify-type-provider in repo currently. Trust the existing auth gate for Phase 1.
