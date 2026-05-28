# Phase 01 — Provider Router

**Priority:** P1 (blocks phases 2 & 3)
**Status:** Pending
**Effort:** 1.5h

## Overview

Build `src/server/ai/provider-router.ts` — a streaming chat router that tries providers in configured priority order, falls back on error/rate-limit. Install `openai` SDK (covers both OpenAI and Groq).

## Key Insights

- Groq uses OpenAI-compatible API — one `openai` package, different `baseURL`
- `@anthropic-ai/sdk` already installed; `getCouncilClient()` in `anthropic-runner.ts` reusable
- Router must expose a single `streamChat()` function returning `AsyncIterable<string>` so the endpoint stays provider-agnostic
- Fallback on: HTTP 429 (rate limit), HTTP 5xx, network error, `ECONNREFUSED`
- If ALL providers fail → throw so endpoint returns 503

## Requirements

- Config driven by env vars (no code change to add/remove providers)
- `AI_CHAT_PROVIDERS=anthropic,groq,openai` — order = priority
- Each provider active only if its key env var is set
- Streaming: yield tokens as they arrive, not buffered
- Provider-specific models hardcoded as sensible defaults (overridable via env)

## Architecture

```
AI_CHAT_PROVIDERS env
        │
        ▼
┌─────────────────────────────┐
│  buildProviderChain()       │  reads env, returns ordered ProviderConfig[]
└────────────┬────────────────┘
             │
        ┌────▼────┐
        │ provider│  try first
        │  [0]    │──── error/429 ──► try [1] ──── error ──► try [2]
        └─────────┘                                              │
             │ success                                    all failed → throw
             ▼
    AsyncIterable<string>  (streamed tokens)
```

**Types:**
```ts
interface ChatMessage { role: 'user' | 'assistant'; content: string }

interface ChatContext {
  symbol?: string
  timeframe?: string
  backtestResult?: { winRate: number; sharpe: number; maxDrawdown: number; totalTrades: number; pnl: number }
  journalStats?: { totalTrades: number; winRate: number; avgRR: number }
  activePanel?: string
}

type ProviderName = 'anthropic' | 'openai' | 'groq'

interface ProviderConfig {
  name: ProviderName
  apiKey: string
  model: string
  baseURL?: string  // for groq
}
```

**System prompt builder** — pure function, takes `ChatContext`, returns string. Same prompt regardless of provider.

## Related Code Files

- **Create:** `src/server/ai/provider-router.ts`
- **Modify:** `package.json` — add `openai` dependency
- **Modify:** `.env.example` — add `OPENAI_API_KEY`, `GROQ_API_KEY`, `AI_CHAT_PROVIDERS`
- **Read:** `src/server/ai/council/anthropic-runner.ts` — reuse `getCouncilClient()`

## Implementation Steps

1. Install `openai` package:
   ```bash
   pnpm add openai
   ```

2. Create `src/server/ai/provider-router.ts`:

   ```ts
   import Anthropic from '@anthropic-ai/sdk';
   import OpenAI from 'openai';
   import { getCouncilClient } from './council/anthropic-runner.js';

   // --- types (export for chat.ts to import) ---
   export interface ChatMessage { role: 'user' | 'assistant'; content: string }
   export interface ChatContext { ... }

   // --- system prompt ---
   function buildSystemPrompt(ctx?: ChatContext): string {
     let prompt = `You are a trading assistant embedded in a personal trading app. ...`;
     if (ctx?.symbol) prompt += `\nActive symbol: ${ctx.symbol} ${ctx.timeframe ?? ''}`;
     if (ctx?.backtestResult) prompt += `\nLast backtest: winRate=${ctx.backtestResult.winRate}% ...`;
     if (ctx?.journalStats) prompt += `\nJournal: ${ctx.journalStats.totalTrades} trades ...`;
     return prompt;
   }

   // --- provider chain builder ---
   function buildProviderChain(): ProviderConfig[] { ... }

   // --- per-provider stream functions ---
   async function* streamAnthropic(...): AsyncIterable<string> { ... }
   async function* streamOpenAI(...): AsyncIterable<string> { ... }  // also handles Groq

   // --- exported router ---
   export async function* streamChat(
     messages: ChatMessage[],
     ctx: ChatContext | undefined,
     signal?: AbortSignal,
   ): AsyncIterable<string> {
     const chain = buildProviderChain();
     if (chain.length === 0) throw new Error('No AI provider configured');
     for (const provider of chain) {
       try {
         yield* provider.name === 'anthropic'
           ? streamAnthropic(provider, messages, ctx, signal)
           : streamOpenAI(provider, messages, ctx, signal);
         return;  // success — stop iterating providers
       } catch (err) {
         if (isLastProvider) throw err;
         // else: log warning, try next
       }
     }
   }
   ```

3. **Anthropic streaming** — use `client.messages.stream()`:
   ```ts
   async function* streamAnthropic(cfg, messages, ctx, signal) {
     const client = getCouncilClient();
     if (!client) throw new Error('Anthropic key not set');
     const stream = client.messages.stream({
       model: cfg.model,
       max_tokens: 1024,
       system: buildSystemPrompt(ctx),
       messages,
     });
     for await (const event of stream) {
       if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
         yield event.delta.text;
       }
     }
   }
   ```

4. **OpenAI/Groq streaming** — same function, different client config:
   ```ts
   async function* streamOpenAI(cfg, messages, ctx, signal) {
     const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
     const stream = await client.chat.completions.create({
       model: cfg.model,
       stream: true,
       messages: [{ role: 'system', content: buildSystemPrompt(ctx) }, ...messages],
     });
     for await (const chunk of stream) {
       const text = chunk.choices[0]?.delta?.content ?? '';
       if (text) yield text;
     }
   }
   ```

5. **`buildProviderChain()`** reads `AI_CHAT_PROVIDERS` (default: `'anthropic'`), filters to providers with keys set:
   ```ts
   const DEFAULTS: Record<ProviderName, { model: string; baseURL?: string }> = {
     anthropic: { model: 'claude-haiku-4-5-20251001' },
     openai:    { model: 'gpt-4o-mini' },
     groq:      { model: 'llama-3.3-70b-versatile', baseURL: 'https://api.groq.com/openai/v1' },
   };
   ```

6. Add to `.env.example`:
   ```
   # AI Chat provider keys. Set whichever you have. Router tries in AI_CHAT_PROVIDERS order.
   # OPENAI_API_KEY=
   # GROQ_API_KEY=
   # AI_CHAT_PROVIDERS=anthropic,groq,openai   # priority order; skips providers without keys
   ```

## Todo List

- [ ] `pnpm add openai`
- [ ] Create `src/server/ai/provider-router.ts` with types, system prompt, chain builder, stream functions, `streamChat` export
- [ ] Add `OPENAI_API_KEY`, `GROQ_API_KEY`, `AI_CHAT_PROVIDERS` to `.env.example`
- [ ] Verify TypeScript compiles with no errors

## Success Criteria

- `streamChat()` streams tokens from first available provider
- Falls back to next provider on 429 or any thrown error
- Returns `AsyncIterable<string>` (endpoint-agnostic)
- Compiles clean

## Risk Assessment

- Groq `baseURL` must include `/v1` suffix — easy to miss
- Anthropic streaming event shape differs from OpenAI — isolated in separate function
- `AbortSignal` support: pass to Anthropic stream; OpenAI SDK accepts it in request options

## Security Considerations

- API keys read from env only — never log, never expose in responses
- `signal` forwarded to abort in-flight requests on client disconnect
