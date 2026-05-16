# Phase 03 — Orchestrator + Cache + Cost Ledger

## Context Links

- `src/server/ai/analyze.ts:21-26` — lazy `getClient()` pattern. Reuse verbatim.
- `src/server/ai/analyze.ts:78-92` — Anthropic call + cost calc pattern.
- Phase 01: `types.ts`, `agents.ts`.
- Phase 02: `context-builder.ts`.

## Overview

- **Date:** 2026-05-16
- **Description:** `runCouncil(req)` executes the 12-call pipeline with parallel/sequential staging, LRU cache keyed on `symbol:tf:lastCandleTime` (4h TTL), and per-stage cost aggregation.
- **Priority:** P2
- **Status:** pending
- **Review status:** not reviewed

## Key Insights

- Three parallel batches must be `Promise.all`'d: analysts (4 calls), debate (2 calls), risk (3 calls). Sequential between batches.
- Cache TTL of 4h matches typical timeframe drift; on a 1h chart that's 4 fresh bars before re-running. Cache key bakes in `lastCandleTime` so a new bar invalidates automatically anyway.
- PM's tool-use response: parse `result.content` for `type === 'tool_use'` block, read `input` as `PMDecision`. Fallback to error if tool not invoked.
- Cost calc per call: Haiku = `inTok/1M * 0.80 + outTok/1M * 4.00`; Sonnet 4.6 = `inTok/1M * 3.00 + outTok/1M * 15.00` (verify against Anthropic pricing page before commit). Total Phase-1 ceiling per call: ~$0.05 (11 Haiku ≈ $0.02 + 1 Sonnet ≈ $0.03).
- Map-based LRU is fine for Phase 1 (one symbol pinned, ~10 entries max); no need for an LRU lib.
- Use `AbortController` with a global ~60s timeout to prevent hung pipelines.

**Per-stage cost estimate (back-of-envelope, Haiku unless noted):**

| Stage | Input toks | Output toks | $ each |
|---|---|---|---|
| Each analyst (×4) | ~800 | ~250 | ~$0.0016 |
| Bull/Bear (×2) | ~1200 | ~300 | ~$0.0022 |
| Research Manager | ~1500 | ~400 | ~$0.0028 |
| Trader | ~1200 | ~300 | ~$0.0022 |
| Each risk persona (×3) | ~1500 | ~250 | ~$0.0022 |
| Portfolio Manager (Sonnet) | ~2000 | ~400 | ~$0.0120 |
| **Pipeline total** | | | **~$0.035** |

## Requirements

**Functional**
- Export `runCouncil(req: { symbol: string; timeframe: Timeframe; alertEngine: AlertEngine }): Promise<{ ok: true; report: CouncilReport; cached: boolean } | { ok: false; error: string }>`.
- Cache: `Map<string, {report: CouncilReport; expiresAt: number}>`; key `${symbol}:${tf}:${lastCandleTime}`; TTL 4h (configurable via `COUNCIL_CACHE_TTL_MS`, default `4*60*60*1000`).
- On cache hit: return `{ok: true, report, cached: true}` without API calls.
- On cache miss:
  1. `buildContext` → if `null`, return `{ok: false, error: '...'}`.
  2. Parallel: 4 analysts via `Promise.all`.
  3. Parallel: bull + bear via `Promise.all`.
  4. Sequential: research manager.
  5. Sequential: trader.
  6. Parallel: 3 risk personas via `Promise.all`.
  7. Sequential: PM with tool-use, parse `PMDecision`.
- Each call wrapped in try/catch; first failure aborts pipeline and returns `{ok: false, error: 'stage X failed: ...'}`.
- Cost ledger accumulates one entry per call; `totalUsd` sums entries.
- Analyst output marked `dataAvailable: false` when response contains `"data unavailable"`.

**Non-Functional**
- File ≤ 200 LOC. If tight, extract `callAnthropic` helper into separate `src/server/ai/council/anthropic-runner.ts` (keep that ≤ 80 LOC).
- Lazy client init (mirror `analyze.ts`).
- No new npm deps.

## Architecture

```
runCouncil(req)
   |
   v
+--------- cache get(key) ---------+
|                                  |
v miss                             v hit
buildContext()                    return cached
   |
   v
analysts (4 parallel)
   |
   v
debate (bull, bear parallel)
   |
   v
researchManager (1)
   |
   v
trader (1)
   |
   v
risk (3 parallel)
   |
   v
portfolioManager (Sonnet, tool-use)
   |
   v
cache.set(key, report) → return
```

## Related Code Files

**Create**
- `src/server/ai/council/orchestrator.ts`
- (Optional, if LOC tight) `src/server/ai/council/anthropic-runner.ts` — single `runPrompt(spec): Promise<{text, inTok, outTok, costUsd, toolInput?}>`.

**Modify** — none in this phase.

**Delete** — none.

## Implementation Steps

1. Create `anthropic-runner.ts` helper (if extracting):
   - Lazy `getClient()` cloned from `analyze.ts`.
   - `export async function runPrompt(spec: PromptSpec, stage: Stage): Promise<{text: string; toolInput?: unknown; inTok: number; outTok: number; costUsd: number}>`.
   - Compute `costUsd` based on model: branch on `spec.model.startsWith('claude-haiku')` vs `claude-sonnet`. Hardcode rate table.
   - If `spec.tools` set, call with `tools` + `tool_choice: {type: 'tool', name: spec.tools[0].name}`. Extract `tool_use` block's `input`.

2. Create `orchestrator.ts`:
   - Module-scope cache map + TTL constant.
   - `function cacheKey(symbol, tf, t)` → `${symbol}:${tf}:${t}`.
   - `runCouncil` orchestrates per the architecture above.
   - Build `CostLedger` incrementally; each `runPrompt` result pushes one entry.
   - Detect `"data unavailable"` substring on analyst outputs to set `dataAvailable: false`.
   - PM parsing: if `toolInput` missing or fails shape check, fail pipeline with explicit error.
   - On success, write to cache then return.

3. Add a tiny `clearCouncilCache()` export for tests.

4. `pnpm exec tsc -p tsconfig.server.json --noEmit`.

## Todo List

- [ ] Confirm Sonnet 4.6 pricing rates (verify against Anthropic pricing page).
- [ ] Implement `runPrompt` helper with tool-use path.
- [ ] Implement `runCouncil` with parallel/sequential staging matching the diagram.
- [ ] Cache hit/miss path tested (test in Phase 04).
- [ ] Cost ledger sums correctly.
- [ ] `"data unavailable"` detection sets `dataAvailable: false`.
- [ ] PM tool-use parse path handles missing tool block.
- [ ] AbortController timeout (60s default) wired.
- [ ] File(s) under 200 LOC each.
- [ ] `tsc --noEmit` clean.

## Success Criteria

- Calling `runCouncil` with a populated AlertEngine returns a fully-shaped `CouncilReport` (when mock client responds).
- Second call with unchanged `lastCandleTime` returns `cached: true` and makes zero API calls.
- Cost ledger `totalUsd` equals sum of `entries[*].costUsd`.
- Pipeline aborts on first failure with a stage-tagged error.

## Risk Assessment

- **Concurrency bursts** — 4 parallel analyst calls then 3 parallel risk calls may hit Anthropic rate limits on shared keys. Mitigation: leave as-is for Phase 1; document; revisit if 429s seen.
- **Tool-use parsing** — SDK shape for `tool_use` block must be handled correctly. Mitigation: type guard via `block.type === 'tool_use'`, log raw response on parse failure.
- **Cache memory growth** — unbounded Map. Mitigation: cap at 50 entries with FIFO eviction.
- **Hung pipeline** — one slow call holds the whole chain. Mitigation: AbortController + 60s default timeout per call.
- **Sonnet model ID drift** — wrong ID = 404. Mitigation: verify once in Phase 01; centralize constant.

## Security Considerations

- API key read lazily from `process.env.ANTHROPIC_API_KEY` — never logged.
- User-supplied `symbol`/`timeframe` already validated by AlertEngine's type system before reaching council.
- Prompts include market data only — no PII.
- PM `PMDecision.action` is advisory text — Phase 1 does NOT wire to AutoExecutor (hard constraint).

## Next Steps

- Phase 04 wires the HTTP endpoint and writes tests against a mocked Anthropic client.
