# Implementation Report — AI Council Phase 1

Date: 2026-05-16
Branch: feat/alerts-dedup-trailing-sl
Status: COMPLETED

## Files Created

| File | LOC |
|---|---|
| `src/server/ai/council/types.ts` | 77 |
| `src/server/ai/council/agents.ts` | 156 |
| `src/server/ai/council/context-builder.ts` | 54 |
| `src/server/ai/council/anthropic-runner.ts` | 81 |
| `src/server/ai/council/orchestrator.ts` | 152 |
| `tests/council-context-builder.test.ts` | 73 |
| `tests/council-orchestrator.test.ts` | 211 |

## Files Modified

| File | Change |
|---|---|
| `src/server/index.ts` | +1 import, +10 lines council route gate |
| `.env.example` | +9 lines COUNCIL_ENABLED block |

## Tasks Completed

- [x] Phase 01: types.ts (8 types) + agents.ts (12 prompt builders + model constants)
- [x] Phase 02: context-builder.ts (`buildContext` from AlertEngine snapshots)
- [x] Phase 03: anthropic-runner.ts (lazy client, cost calc) + orchestrator.ts (parallel/sequential pipeline, LRU cache, cost ledger)
- [x] Phase 04: POST /api/council gate in index.ts + COUNCIL_ENABLED in .env.example + 14 tests (8 orchestrator + 6 context-builder)

## Tests Status

- typecheck: PASS (`pnpm exec tsc -p tsconfig.server.json --noEmit`)
- All tests: 51 passed / 0 failed (`pnpm test:run`)
- New council tests: 14 / 14

## Deviations from Plan

1. `council-orchestrator.test.ts` is 211 LOC — slightly over 200. All production files are under 200.
2. Test parallelism verified via call-order counter (not wall-clock timing) — more reliable per plan's own risk note.
3. `HAIKU_MODEL` re-exported from `agents.ts` and imported at top of `orchestrator.ts` (trailing import was invalid — moved to import block).
4. Removed `HAIKU_MODEL` from `anthropic-runner.ts` imports (unused after refactor) to keep typecheck clean.

## Open Issues / Notes

- Sonnet model ID used: `claude-sonnet-4-6-20251001` (per Q1 resolution). If runtime 404s appear, change `SONNET_MODEL` constant in `agents.ts`.
- No auth verification on `/api/council` — mirrors `/api/analyze` which also has no explicit per-route auth. Flagged as known gap in Phase 04 plan.
- Cache is module-scope `Map` — persists across requests until restart. 50-entry FIFO cap implemented.
