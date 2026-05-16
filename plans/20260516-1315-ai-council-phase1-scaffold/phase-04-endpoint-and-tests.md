# Phase 04 — Endpoint, Tests, Env Flag

## Context Links

- `src/server/index.ts:172-175` — `/api/analyze` endpoint to mirror.
- `tests/alert-dedup.test.ts:1-40` — vitest pattern reference.
- `vitest.config.ts` — include glob `tests/**/*.{test,spec}.{ts,tsx}`.
- Phase 03: `runCouncil` orchestrator + `clearCouncilCache` export.

## Overview

- **Date:** 2026-05-16
- **Description:** Register `POST /api/council` (feature-gated by `COUNCIL_ENABLED`), document the env flag in `.env.example`, ship two vitest files covering orchestration ordering, caching, cost summation, and stub markers.
- **Priority:** P2
- **Status:** pending
- **Review status:** not reviewed

## Key Insights

- Feature flag pattern: when `COUNCIL_ENABLED !== 'true'`, the route returns 404 — not a 503 — so it disappears entirely in production until enabled (mirrors how `ALERT_SYMBOLS` parsing returns empty when unset).
- Tests mock the Anthropic SDK via `vi.mock('@anthropic-ai/sdk', ...)` so we don't need network. Mock `messages.create` to return shaped responses including `usage` and (for PM) `tool_use` blocks.
- Concurrency test: track call timestamps on the mock. Assert that all 4 analyst calls land within a small window (e.g., <5ms apart) while sequential stages don't.
- Context-builder test: synthesize a fake `AlertEngine` (or stub) with known snapshot to keep the test pure.

## Requirements

**Functional**
- `POST /api/council` accepts `{symbol: string, timeframe: Timeframe}` body, calls `runCouncil`, returns JSON.
- When `COUNCIL_ENABLED !== 'true'`, route is not registered (so it 404s).
- `.env.example` gains a `COUNCIL_ENABLED` block with documentation.
- `tests/council-orchestrator.test.ts` covers:
  - Parallel ordering: 4 analyst calls fire concurrently; 3 risk calls concurrently.
  - Sequential ordering: manager only fires after debate completes; trader after manager; PM after risk.
  - Cache hit: second call with same `lastCandleTime` returns `cached: true`, mock invoked zero times.
  - Cost ledger: `totalUsd === sum(entries)`.
  - Stub marker: when stub-analyst mock returns `"data unavailable"`, the corresponding `AnalystOutput.dataAvailable` is `false`.
  - PM tool-use: mock returns `tool_use` block with `PMDecision`-shaped `input`; orchestrator parses it correctly.
- `tests/council-context-builder.test.ts` covers:
  - Returns `null` when no matching snapshot.
  - Populated AlertEngine → context with non-empty `recentCandles`, `zones`, last-60 length cap, `lastCandleTime` matches last candle.
  - No active wave → `mtf` is `null`.

**Non-Functional**
- All tests run via `pnpm test` and pass.
- No network calls (Anthropic SDK mocked).
- Endpoint file diff in `src/server/index.ts` < 25 LOC.

## Architecture

```
client --POST /api/council--> fastify route
                                |
                                v (only registered when COUNCIL_ENABLED=true)
                              runCouncil({symbol, tf, alertEngine})
                                |
                                v
                              CouncilReport JSON
```

## Related Code Files

**Create**
- `tests/council-orchestrator.test.ts`
- `tests/council-context-builder.test.ts`

**Modify**
- `src/server/index.ts` — register route conditionally near line 175 (after `/api/analyze`).
- `.env.example` — add `COUNCIL_ENABLED` block under the Anthropic section (~line 53).

**Delete** — none.

## Implementation Steps

1. Modify `src/server/index.ts`:
   - Import: `import { runCouncil } from './ai/council/orchestrator.js';`.
   - After the `/api/analyze` block (~line 175), add:
     ```ts
     if (process.env.COUNCIL_ENABLED === 'true') {
       fastify.post('/api/council', async (req) => {
         const { symbol, timeframe } = req.body as { symbol: string; timeframe: Timeframe };
         return runCouncil({ symbol, timeframe, alertEngine });
       });
     }
     ```
   - Ensure `Timeframe` is already imported; if not, add to existing shared types import.

2. Modify `.env.example` — append after the Anthropic block (~line 53):
   ```
   # AI Trading Council (multi-agent advisory pipeline). Disabled by default
   # because each /api/council call runs ~12 LLM calls (~$0.03-0.05 each).
   # Endpoint /api/council is not registered until COUNCIL_ENABLED=true.
   # COUNCIL_ENABLED=true
   # COUNCIL_CACHE_TTL_MS=14400000
   ```

3. Create `tests/council-context-builder.test.ts`:
   - Use synthetic candles fixture (or import existing helper from `tests/fixtures/`).
   - Construct a fake `AlertEngine` exposing `snapshots()` (interface match is enough; cast or use small fake class).
   - Three tests per Requirements.

4. Create `tests/council-orchestrator.test.ts`:
   - `vi.mock('@anthropic-ai/sdk', () => ({...}))` returning a class whose `messages.create` is a `vi.fn()`.
   - Each `mockImplementation` records `Date.now()` and the prompt's expected `Stage` (parse from `system` text or call sequence index).
   - Stage detection trick: queue different mock responses in call order matching pipeline; alternative — branch on `model` (Sonnet → PM).
   - For tool-use response: return `content: [{type: 'tool_use', name: 'submit_decision', input: {...PMDecision}}]`.
   - Test parallelism: insert artificial 20ms delays in mock, verify total wall-clock for analyst batch ≈ 20ms (not 80ms).
   - Test cache: import `clearCouncilCache()`; call once with mock client; clear; call again — same `lastCandleTime` should hit cache (use a fresh second test where context unchanged → second `runCouncil` returns `cached: true` AND mock not called second time). Without `clearCouncilCache` between tests, isolation breaks.

5. Run `pnpm test` — all tests green. Run `pnpm exec tsc -p tsconfig.server.json --noEmit`.

## Todo List

- [ ] Add `COUNCIL_ENABLED` gate + route registration in `src/server/index.ts`.
- [ ] Document `COUNCIL_ENABLED` + `COUNCIL_CACHE_TTL_MS` in `.env.example`.
- [ ] Write `council-context-builder.test.ts` (3 cases).
- [ ] Write `council-orchestrator.test.ts` (6 cases listed above).
- [ ] Mock Anthropic SDK with stage-aware fake responses.
- [ ] Verify parallel batches run concurrently via wall-clock assertion.
- [ ] Verify cache short-circuit avoids mock invocation.
- [ ] `pnpm test` all green.
- [ ] `tsc --noEmit` clean.

## Success Criteria

- `COUNCIL_ENABLED` unset → `curl -X POST /api/council` returns 404.
- `COUNCIL_ENABLED=true` → endpoint returns shaped `CouncilReport` (or `{ok: false, error}` on stage failure).
- `pnpm test` passes all 9+ new cases.
- No fake/mock/cheat shortcuts in production code — mocks live only in `tests/`.

## Risk Assessment

- **Test flakiness on parallelism timing** — wall-clock asserts can flake on slow CI. Mitigation: assert order-of-resolution via a shared counter rather than absolute timing. E.g., each mock increments and records the counter; analysts should all see counter 1-4 before debate sees 5+.
- **Mock leakage across tests** — module-scope cache in orchestrator persists. Mitigation: `beforeEach(() => clearCouncilCache())` and `vi.clearAllMocks()`.
- **Endpoint exposed accidentally in prod** — default `COUNCIL_ENABLED=false` and the 404 (not 503) behavior reduces blast radius.

## Security Considerations

- Endpoint requires existing auth (Fastify auth hook from `APP_AUTH_TOKEN` — verify it applies to `/api/*` routes; if not, document as a known gap and file follow-up).
- No body validation lib added (YAGNI for Phase 1); endpoint trusts the caller already passed auth.
- API key never logged in tests (mock bypasses real client entirely).

## Next Steps

- Phase 2 (out of scope here): wire vnstock/CafeF/fireant adapters into stub analysts so `dataAvailable` flips to `true`.
- Phase 3 (out of scope here): UI panel + scanner integration + Telegram digest.
