# Phase 02 — Chat API Endpoint

**Priority:** P1
**Status:** Pending
**Effort:** 1h
**Blocked by:** Phase 01 (provider router must exist)

## Overview

Create `src/server/ai/chat.ts` — Fastify route handler for `POST /api/chat`. Accepts messages + context, streams response via SSE using `streamChat()` from the provider router.

## Key Insights

- Fastify supports SSE natively via `reply.raw` (Node `ServerResponse`) — no extra plugin needed
- Keep handler thin: validate input → call `streamChat()` → pipe tokens to response
- Client sends last 10 messages max (sliding window enforced client-side); server just passes them through
- `ANTHROPIC_API_KEY` check pattern from `analyze.ts` reusable for "no provider configured" guard

## Requirements

- `POST /api/chat` — streaming `text/event-stream` response
- Input validation: `messages` array required, `context` optional
- On stream error mid-response: send `data: [ERROR]\n\n` then close
- Disabled gracefully if no AI provider keys set (return 503 with JSON error)
- Register route only when at least one provider key is present (mirrors `COUNCIL_ENABLED` pattern)

## Architecture

```
POST /api/chat
  { messages: ChatMessage[], context?: ChatContext }
        │
        ▼
  validate body (messages array, role enum)
        │
        ▼
  set headers: Content-Type: text/event-stream, Cache-Control: no-cache
        │
        ▼
  for await (token of streamChat(messages, context, signal)):
    reply.raw.write(`data: ${token}\n\n`)
        │
        ▼
  reply.raw.write('data: [DONE]\n\n')
  reply.raw.end()
```

## Related Code Files

- **Create:** `src/server/ai/chat.ts`
- **Modify:** `src/server/index.ts` — import and register route
- **Read:** `src/server/ai/provider-router.ts` — `streamChat`, `ChatMessage`, `ChatContext`
- **Read:** `src/server/ai/analyze.ts` — reference for route registration pattern

## Implementation Steps

1. Create `src/server/ai/chat.ts`:

   ```ts
   import type { FastifyInstance } from 'fastify';
   import { streamChat, type ChatMessage, type ChatContext } from './provider-router.js';

   interface ChatBody {
     messages: ChatMessage[];
     context?: ChatContext;
   }

   export async function registerChatRoute(app: FastifyInstance): Promise<void> {
     app.post<{ Body: ChatBody }>('/api/chat', async (req, reply) => {
       const { messages, context } = req.body;

       if (!Array.isArray(messages) || messages.length === 0) {
         return reply.status(400).send({ error: 'messages array required' });
       }

       // Clamp to last 10 turns (server-side safety net)
       const trimmed = messages.slice(-10) as ChatMessage[];

       reply.raw.setHeader('Content-Type', 'text/event-stream');
       reply.raw.setHeader('Cache-Control', 'no-cache');
       reply.raw.setHeader('Connection', 'keep-alive');
       reply.raw.flushHeaders();

       const controller = new AbortController();
       req.raw.on('close', () => controller.abort());

       try {
         for await (const token of streamChat(trimmed, context, controller.signal)) {
           if (controller.signal.aborted) break;
           reply.raw.write(`data: ${token}\n\n`);
         }
         reply.raw.write('data: [DONE]\n\n');
       } catch (err) {
         const msg = (err as Error).message ?? 'AI provider error';
         reply.raw.write(`data: [ERROR] ${msg}\n\n`);
       } finally {
         reply.raw.end();
       }
     });
   }
   ```

2. Register in `src/server/index.ts`:
   - Import: `import { registerChatRoute } from './ai/chat.js';`
   - Add near other AI routes: `await registerChatRoute(fastify);`
   - No `CHAT_ENABLED` gate needed — router itself returns 503-equivalent error if no keys set

3. Verify TypeScript compiles clean.

## Todo List

- [ ] Create `src/server/ai/chat.ts` with `registerChatRoute`
- [ ] Import and register in `src/server/index.ts`
- [ ] Compile check: `pnpm tsc --noEmit`

## Success Criteria

- `POST /api/chat` returns `text/event-stream` with token-by-token output
- Client disconnect aborts the in-flight AI request
- Invalid body returns 400 JSON (not a stream)
- No provider keys → stream emits `[ERROR] No AI provider configured` then closes

## Risk Assessment

- Fastify's default body parser has a size limit — 10-message history stays well under 1MB default
- `reply.raw.flushHeaders()` must be called before any async work to establish SSE connection
- Do NOT `return reply.send(...)` after setting raw headers — Fastify will double-send
