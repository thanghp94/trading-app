# Trading Chat Bot — Design Spec

**Date:** 2026-05-28
**Status:** Approved

## Summary

Add a context-aware chat bot as a dock panel tab. The bot serves two roles: app tutor (explains features, backtest params, metrics) and trading teacher (concepts like R:R, wave theory, S/R zones). It reads the user's current app state and references it directly in answers.

---

## Architecture

### Server: `src/server/ai/chat.ts`

New Fastify route handler registered in `index.ts`.

**Endpoint:** `POST /api/chat`

**Request body:**
```ts
{
  messages: { role: "user" | "assistant"; content: string }[];  // last 10 turns
  context?: {
    symbol?: string;
    timeframe?: string;
    backtestResult?: {
      winRate: number;
      sharpe: number;
      maxDrawdown: number;
      totalTrades: number;
      pnl: number;
    };
    journalStats?: {
      totalTrades: number;
      winRate: number;
      avgRR: number;
    };
    activePanel?: string;
  };
}
```

**Response:** `text/event-stream` — streams Claude's reply token-by-token.

**Model:** `claude-haiku-4-5-20251001` (already defined as `HAIKU_MODEL` in `agents.ts`).

**System prompt behavior:**
- Identifies as trading assistant embedded in the app
- Explains app features and parameters when asked
- Explains backtest metrics (Sharpe, max drawdown, win rate, R:R) in plain language
- Teaches trading concepts (S/R zones, wave theory, trend, position sizing)
- When context is provided, cites the user's actual numbers
- Never gives financial advice — explains concepts only, no "buy/sell X"
- Answers in the same language the user writes in (EN or VN)

**Implementation notes:**
- `anthropic-runner.ts` is non-streaming — `chat.ts` must call `client.messages.stream()` directly from `@anthropic-ai/sdk`
- Reuse `getCouncilClient()` from `anthropic-runner.ts` to get the shared Anthropic client
- Pipe `stream.textStream` into the Fastify reply as `text/event-stream`
- Keep handler under ~80 lines; system prompt in a separate const

---

### Frontend

#### `src/web/components/ChatPanel.tsx` (new, ~170 lines)

Dock tab component.

**UI layout:**
- Message list (scrollable, flex-col): user messages right-aligned, assistant left-aligned
- Typing indicator (animated dots) while streaming
- Input row: `<textarea>` (auto-resize, max 4 lines) + Send button
- Send on Enter, newline on Shift+Enter
- "Clear chat" button in header
- Context badge in header showing active symbol when present

**State:**
- `messages: Message[]` — local React state, max 30 kept for display, last 10 sent to API
- `streaming: boolean` — disables input while response in flight
- `pendingAssistant: string` — accumulates streaming tokens

**On send:**
1. Append user message to state
2. Snapshot context via `useChatContext()`
3. POST `/api/chat` with last 10 messages + context
4. Stream response into `pendingAssistant`, flush to messages on completion
5. Re-enable input

---

#### `src/web/use-chat-context.ts` (new, ~45 lines)

Hook that assembles context snapshot.

```ts
export function useChatContext(): ChatContext
```

Sources:
- `symbol`, `timeframe` — from `use-feed` or passed as prop
- `backtestResult` — from BacktestHub's last run result (passed via prop or lifted state)
- `journalStats` — fetched from `/api/journal/stats` on mount (cached, not refetched per message)
- `activePanel` — from `use-dock` active tab

---

#### `src/web/components/DockBar.tsx` (modify)

Add "Chat" tab entry with a message-bubble icon (Lucide `MessageCircle`). Renders `<ChatPanel>` when active.

---

## Data Flow

```
User types → ChatPanel
  → useChatContext() snapshots { symbol, backtestResult, journalStats, activePanel }
  → POST /api/chat { messages[-10:], context }
    → server builds system prompt with context
    → Claude Haiku streams reply
  → SSE tokens → pendingAssistant accumulates
  → message appended on stream end
```

---

## Error Handling

- Network error: show inline "Connection failed. Try again." message
- API key missing: server returns 503, show "AI unavailable" message
- Stream timeout (>30s): abort and show timeout message

---

## Constraints

- No message persistence — chat is session-only, cleared on page reload
- No tool use — pure text conversation
- Max 10 messages sent per request (sliding window) to control token cost
- Haiku model only — keeps cost low for frequent conversational use
- Context snapshot is read-only — bot cannot modify app state

---

## Files

| Action | Path |
|--------|------|
| Create | `src/server/ai/chat.ts` |
| Modify | `src/server/index.ts` — register `/api/chat` route |
| Create | `src/web/components/ChatPanel.tsx` |
| Create | `src/web/use-chat-context.ts` |
| Modify | `src/web/use-dock.ts` — add `"chat"` to `PanelId` union |
| Modify | `src/web/components/DockBar.tsx` — add Chat tab |

---

## Out of Scope

- Persistent chat history across sessions
- Bot triggering trades or modifying backtest params
- Multi-turn memory beyond 10-message window
- Voice input/output
