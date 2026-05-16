# Phase 01 — Types and Prompt Builders

## Context Links

- Pattern to mirror: `src/server/ai/analyze.ts` (system + user prompt structure, model ID, cost calc).
- Council inputs feeding prompts: `src/shared/indicators/sr-zone-tracker.ts` (Zone), `src/shared/indicators/wave-counter.ts` (WaveCount), `src/shared/indicators/mtf.ts` (MtfCheck), `src/shared/types.ts` (Candle, Timeframe).
- Anthropic SDK already installed (used by `analyze.ts`).

## Overview

- **Date:** 2026-05-16
- **Description:** Land the type contracts and 12 pure prompt-builder functions. No Anthropic calls yet — pure functions returning `{system, user, model}`.
- **Priority:** P2
- **Status:** pending
- **Review status:** not reviewed

## Key Insights

- Prompt builders as pure functions makes orchestrator testable (snapshot prompts without network).
- 11 of 12 calls use Haiku 4.5 (`claude-haiku-4-5-20251001` — same model ID `analyze.ts` already uses). PM uses Sonnet 4.6 (`claude-sonnet-4-6-20251001` — verify exact ID before commit).
- PM is the ONLY call using tool-use; everything else returns free text.
- Stub analysts (fundamental/news/sentiment) must explicitly emit `"data unavailable"` marker — bake that instruction into their system prompts so they don't fabricate.
- Keep each prompt builder < 30 LOC. Twelve builders + types must fit in two files < 200 LOC each.

## Requirements

**Functional**
- Export 12 prompt builders from `agents.ts`: `analystTechnical, analystFundamental, analystNews, analystSentiment, bull, bear, researchManager, trader, riskAggressive, riskNeutral, riskConservative, portfolioManager`.
- Each returns `{system: string, user: string, model: string, maxTokens: number, tools?: Anthropic.Tool[]}`.
- `portfolioManager` returns a `tools` array with one tool `submit_decision` whose `input_schema` matches `PMDecision`.
- Types exported from `types.ts`: `CouncilReport`, `AnalystOutput`, `DebateRound`, `RiskVerdict`, `PMDecision`, `CouncilContext`, `Stage`, `CostLedger`.

**Non-Functional**
- File sizes: `types.ts` ≤ 120 LOC, `agents.ts` ≤ 200 LOC.
- Pure functions — no I/O, no globals.
- Stub analyst prompts must include literal instruction: `If you have no real data for this symbol, return exactly the string "data unavailable" — do NOT fabricate.`

## Architecture

```
agents.ts (12 builders)         types.ts
        |                          |
        +-----> consumed by ------>+
                orchestrator.ts (Phase 03)
```

`Stage` is a discriminated union driving the orchestrator state machine. `CostLedger` tracks `{stage, model, inTok, outTok, costUsd}[]` plus a `total`.

## Related Code Files

**Create**
- `src/server/ai/council/types.ts`
- `src/server/ai/council/agents.ts`

**Modify** — none.

**Delete** — none.

## Implementation Steps

1. Create `src/server/ai/council/types.ts`:
   - `export type Stage = 'analyst-technical' | 'analyst-fundamental' | 'analyst-news' | 'analyst-sentiment' | 'bull' | 'bear' | 'research-manager' | 'trader' | 'risk-aggressive' | 'risk-neutral' | 'risk-conservative' | 'portfolio-manager';`
   - `CouncilContext`: `{ symbol, timeframe, lastCandleTime, recentCandles: Candle[], zones: Zone[], waves: WaveCount[], mtf: MtfCheck | null }`.
   - `AnalystOutput`: `{ stage: Stage; text: string; dataAvailable: boolean }`.
   - `DebateRound`: `{ bull: string; bear: string }`.
   - `RiskVerdict`: `{ persona: 'aggressive' | 'neutral' | 'conservative'; text: string }`.
   - `PMDecision`: `{ action: 'increase' | 'hold' | 'decrease'; confidence: 'low' | 'med' | 'high'; sizePct: number; tp: number; sl: number; rationale: string }`.
   - `CostLedger`: `{ entries: Array<{stage: Stage; model: string; inTok: number; outTok: number; costUsd: number}>; totalUsd: number }`.
   - `CouncilReport`: `{ symbol, timeframe, cachedAt, analysts: AnalystOutput[], debate: DebateRound, manager: string, trader: string, risk: RiskVerdict[], pm: PMDecision, cost: CostLedger }`.

2. Create `src/server/ai/council/agents.ts`:
   - Constants: `HAIKU = 'claude-haiku-4-5-20251001'`, `SONNET = 'claude-sonnet-4-6-20251001'` (confirm exact ID).
   - Type alias: `export type PromptSpec = { system: string; user: string; model: string; maxTokens: number; tools?: unknown[] }`.
   - Twelve exported functions, each taking the minimum context it needs:
     - `analystTechnical(ctx: CouncilContext)` — compresses candles/zones/waves/mtf (reuse `analyze.ts` compression idioms).
     - `analystFundamental(ctx)`, `analystNews(ctx)`, `analystSentiment(ctx)` — Phase 1 stubs; system prompt enforces `"data unavailable"` marker.
     - `bull(ctx, analysts: AnalystOutput[])` — argues the long case.
     - `bear(ctx, analysts)` — argues the short/avoid case.
     - `researchManager(ctx, analysts, debate)` — synthesizes a balanced view.
     - `trader(ctx, manager: string)` — proposes a single concrete setup.
     - `riskAggressive(ctx, proposal)`, `riskNeutral(...)`, `riskConservative(...)` — each persona has system prompt nailing tolerance.
     - `portfolioManager(ctx, proposal, risk: RiskVerdict[])` — uses Sonnet + tool `submit_decision` with `input_schema` matching `PMDecision`.

3. Run `pnpm exec tsc -p tsconfig.server.json --noEmit` to verify zero compile errors.

## Todo List

- [ ] Create `types.ts` with all 8 exported types.
- [ ] Verify Sonnet 4.6 model ID against Anthropic docs (or via current `@anthropic-ai/sdk` version notes).
- [ ] Create `agents.ts` with 12 prompt builders + model constants.
- [ ] Embed `"data unavailable"` instruction into 3 stub-analyst system prompts.
- [ ] Define PM tool schema (`submit_decision`) matching `PMDecision` exactly.
- [ ] `tsc --noEmit` clean.
- [ ] Both files < 200 LOC.

## Success Criteria

- `tsc --noEmit` passes.
- `wc -l` on each file < 200.
- All 12 builders exported and callable with their declared signatures.
- Stub-analyst prompts contain the literal `"data unavailable"` marker instruction.

## Risk Assessment

- **Model ID drift** — if Sonnet 4.6 ID is wrong, runtime breaks in Phase 03. Verify ID before merge; fallback to `claude-sonnet-4-5-20250929` if needed.
- **LOC overflow on agents.ts** — twelve builders may exceed 200 LOC if prompts are verbose. Mitigation: extract shared boilerplate (e.g., context snippet builder reused across analysts) into a single private helper at top of file.
- **Tool schema mismatch** — Anthropic tool input must validate against `PMDecision`. Mitigation: derive schema from one source of truth via type-level assertion (or document the mirror in a comment).

## Security Considerations

- No secrets in source — `ANTHROPIC_API_KEY` continues to live in env, read lazily in Phase 03.
- Prompt builders are pure — no untrusted user input flows into prompts in this phase (Phase 03 wires request body).

## Next Steps

- Phase 02 builds `CouncilContext` from `AlertEngine.snapshots()`.
- Unblocks Phase 03 orchestrator (consumes both `types.ts` and `agents.ts`).
