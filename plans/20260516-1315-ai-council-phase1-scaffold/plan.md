---
title: "AI Trading Council — Phase 1 Scaffold"
description: "Scaffold multi-agent council pipeline (4 analysts → debate → manager → trader → 3 risk → PM) with on-demand endpoint and caching."
status: done
priority: P2
effort: 11h
branch: feat/alerts-dedup-trailing-sl
tags: [ai, agents, council, anthropic]
created: 2026-05-16
---

# AI Trading Council — Phase 1 Scaffold

## Mission

Scaffold a multi-agent "AI Trading Council" mirroring a fund decision flow. Phase 1 lands runtime + endpoint; data sources for fundamental/news/sentiment remain stubbed. Advisory-only — no AutoExecutor coupling.

```
4 analysts (technical, fundamental, news, sentiment)  [parallel]
  → bull + bear debate                                 [parallel]
  → research manager                                   [sequential synth]
  → trader                                             [sequential proposal]
  → 3 risk personas (aggressive, neutral, conservative) [parallel]
  → portfolio manager (Sonnet 4.6 + tool-use JSON)     [sequential final]
```

12 prompt-driven Anthropic calls. Haiku 4.5 for 11 calls; Sonnet 4.6 only for PM (tool-use → structured `PMDecision`).

## Phases

| # | File | Status | Effort | Description |
|---|---|---|---|---|
| 01 | [phase-01-types-and-prompts.md](./phase-01-types-and-prompts.md) | done | 3h | Types + 12 prompt builders (no runtime) |
| 02 | [phase-02-context-builder.md](./phase-02-context-builder.md) | done | 2h | `buildContext` from AlertEngine snapshots |
| 03 | [phase-03-orchestrator-and-cache.md](./phase-03-orchestrator-and-cache.md) | done | 4h | Pipeline runner + LRU cache + cost ledger |
| 04 | [phase-04-endpoint-and-tests.md](./phase-04-endpoint-and-tests.md) | done | 2h | `POST /api/council` + vitest + env flag |

## Key Dependencies

- `src/server/ai/analyze.ts` — pattern to mirror (lazy client, cost calc).
- `src/server/alerts/alert-engine.ts:37` — `snapshots()` shape.
- `src/shared/indicators/{mtf,sr-zone-tracker,wave-counter}.ts` — context inputs.
- Existing `@anthropic-ai/sdk` dep (no new npm deps allowed).

## Hard Constraints

- Each file < 200 LOC.
- No new npm deps.
- `COUNCIL_ENABLED=false` by default — endpoint 404s when disabled.
- Council fires only via `POST /api/council`; never auto-triggered on alerts.
- Stubbed analysts (fundamental/news/sentiment) MUST emit `"data unavailable"` markers; no hallucinated facts.

## Reports

- [planner-report.md](./reports/planner-report.md) — research notes + open questions.

## Out of Scope (Phase 2+)

vnstock/CafeF/fireant adapters · UI button/panel · scanner integration · Telegram digest · AutoExecutor coupling.
