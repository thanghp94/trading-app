# Phase 07: Council analystFundamental Wiring

**Priority:** Medium | **Status:** Done — 2026-05-31 (126/126 tests, root tsc clean) | **Effort:** Small-Medium
**Depends on:** Phase 01 (fundamentals cache), Phase 04 (ownership cache)

## Overview

The AI council's `analystFundamental` is a stub that always returns "data unavailable"
(agents.ts). Wire the cached fundamentals + ownership into it so the fundamental analyst
gives a real reading for VN equities. Council runs on any symbol (incl. crypto), so the
analyst must branch: real analysis when fundamentals are cached, stub otherwise.

## Key facts (scouted)

- `dataAvailable` auto-derives in orchestrator: `!r.text.includes('data unavailable')`
  (orchestrator.ts:109) — no extra plumbing; real text → `true`.
- `buildContext(symbol, timeframe, alertEngine)` (context-builder.ts:14), called once
  (orchestrator.ts:83). `runCouncil({symbol,timeframe,alertEngine})` called at index.ts:461.
- Caches are sync (`better-sqlite3`) → attaching is cache-only, no python spawn (council
  runs ~12 stages under a 60s budget; must stay fast).

## Files to Modify

- `src/server/ai/council/types.ts` — `CouncilContext` += optional `fundamentals?` / `ownership?`.
- `src/server/ai/council/context-builder.ts` — optional 4th arg `lookups` with
  `getFundamentals?` / `getOwnership?`; attach from cache (null when absent). Backward-compatible.
- `src/server/ai/council/agents.ts` — `analystFundamental` branches on `ctx.fundamentals`:
  present → terse real prompt (P/E, P/B, ROE, EPS, market cap, div yield, latest quarter
  revenue/net profit, top holders, foreign %); absent → existing "data unavailable" stub.
  Add a small `fundamentalSummary(f, ownership)` text builder.
- `src/server/ai/council/orchestrator.ts` — `CouncilRequest` += optional getters; pass to `buildContext`.
- `src/server/index.ts` — pass `getFundamentals: s => fundamentalsStore.get(s)`,
  `getOwnership: s => ownershipStore.get(s)` into `runCouncil`.

## Files to Create

- `tests/council-fundamental-analyst.test.ts` — `analystFundamental` real-vs-stub branch +
  `fundamentalSummary` formatting; `buildContext` attaches fundamentals/ownership from lookups.

## Design

- `analystFundamental(ctx)`:
  - `ctx.fundamentals` present → `{ system: terse fundamental-analyst instruction (allow
    "data unavailable" only if figures are empty/nonsensical), user: "Fundamental analysis
    for ${symbol}\n\n${fundamentalSummary(...)}" }`.
  - absent → unchanged stub (crypto, non-VN, cache miss).
- `fundamentalSummary`: compact labelled lines (VN-ish), nulls omitted; keeps the Haiku
  prompt small (maxTokens 300).
- No change to `dataAvailable` derivation — real output naturally lacks the marker → `true`.

## Implementation Steps (TDD)

1. types: optional `fundamentals?`/`ownership?` on `CouncilContext`.
2. **RED** — `council-fundamental-analyst.test.ts`: analystFundamental with a fundamentals
   ctx → user prompt contains P/E/ROE figures, no forced "data unavailable" marker in user
   text; with no fundamentals → stub user text contains "data unavailable". buildContext with
   injected lookups attaches the objects; without → null.
3. **GREEN** — context-builder lookups + agents branch + `fundamentalSummary`.
4. Wire orchestrator request getters + index.ts call.
5. Verify existing council tests still green (context-builder 3-arg calls unaffected; orchestrator
   stub-dataAvailable test still valid — it forces analyst text, agnostic to the prompt).

## Success Criteria

- [ ] `tsc --noEmit` clean; full `vitest run` green (existing council tests unaffected).
- [ ] Council on a cached VN equity → fundamental analyst cites real figures, `dataAvailable:true`.
- [ ] Council on crypto / uncached symbol → fundamental analyst still "data unavailable", `false`.
- [ ] No python spawn on the council path (cache-only attach).

## Risk Assessment

- **Existing orchestrator test framing** ("indices 1,2,3 are stubs") → fundamental is no longer
  always a stub; the test forces analyst text so it stays valid — update the comment only.
- **Prompt bloat** → `fundamentalSummary` is compact, nulls omitted; Haiku maxTokens unchanged (300).
- **Council latency** → cache-only attach (sync SQLite), no spawn; budget unaffected.
