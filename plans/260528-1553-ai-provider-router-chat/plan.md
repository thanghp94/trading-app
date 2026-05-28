---
title: "AI Provider Router + Chat Bot"
description: "Multi-provider AI router (Anthropic/OpenAI/Groq) with fallback, wired to a context-aware chat dock panel."
status: pending
priority: P2
effort: 4h
issue:
branch: main
tags: [backend, frontend, ai, feature]
created: 2026-05-28
---

# AI Provider Router + Chat Bot

## Overview

Two deliverables built together:

1. **Provider router** — `src/server/ai/provider-router.ts`. Tries configured AI providers in priority order, falls back on rate-limit/error. Supports Anthropic, OpenAI, Groq. Streaming output.
2. **Chat endpoint + UI** — `/api/chat` (POST, SSE stream) + `ChatPanel` dock tab. Context-aware: sends active symbol, backtest result, journal stats with every message.

Council (`/api/council`) stays Anthropic-only — uses `tool_use` not portable to other providers.

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Provider router | Pending | 1.5h | [phase-01](./phase-01-provider-router.md) |
| 2 | Chat API endpoint | Pending | 1h | [phase-02](./phase-02-chat-endpoint.md) |
| 3 | Chat UI (dock panel) | Pending | 1.5h | [phase-03](./phase-03-chat-ui.md) |

## Dependencies

- `openai` npm package (covers OpenAI + Groq via baseURL swap) — install in Phase 1
- `ANTHROPIC_API_KEY` already in `.env.example`
- `OPENAI_API_KEY`, `GROQ_API_KEY`, `AI_CHAT_PROVIDERS` — add to `.env.example` in Phase 1
- Phase 2 depends on Phase 1 (router must exist before endpoint uses it)
- Phase 3 depends on Phase 2 (UI calls the endpoint)
