# Phase 03 — Chat UI (Dock Panel)

**Priority:** P2
**Status:** Pending
**Effort:** 1.5h
**Blocked by:** Phase 02 (endpoint must exist)

## Overview

Add a "Chat" tab to the dock bar. Creates `ChatPanel.tsx`, `use-chat-context.ts`, extends `PanelId` in `use-dock.ts`, and wires the tab into `DockBar.tsx`.

## Key Insights

- `PanelId` is a string union in `use-dock.ts` — just add `| "chat"`
- `DockBar.tsx` renders tabs from an array — add one entry with `MessageCircle` icon (Lucide, already used elsewhere in the app)
- Chat history is session-only (no persistence) — plain `useState`
- Streaming: use `fetch` with `ReadableStream` + `TextDecoder` to read SSE tokens incrementally
- Sliding window: keep full history for display (up to 30), send only last 10 to API
- `use-chat-context.ts` reads journal stats once on mount; symbol/timeframe from props

## Requirements

- Message list: user right-aligned, assistant left-aligned
- Typing indicator (animated dots) while streaming
- Input: `<textarea>` Enter=send, Shift+Enter=newline, auto-resize up to 4 lines
- "Clear" button in header resets messages
- Context badge in header shows active symbol when set
- Disable input while stream in flight
- Parse `[DONE]` sentinel to end stream; `[ERROR]` prefix to show error message

## Architecture

```
App.tsx
  └─ Drawer (dock)
       └─ ChatPanel
            ├─ use-chat-context() → { symbol, timeframe, backtestResult, journalStats }
            ├─ messages: Message[]  (local state)
            ├─ streaming: boolean
            ├─ MessageList
            │    └─ MessageBubble (user | assistant)
            ├─ TypingIndicator  (shown when streaming)
            └─ InputRow
                 ├─ <textarea>
                 └─ <button> Send
```

**SSE reader pattern:**
```ts
async function sendMessage(text: string) {
  setStreaming(true);
  const userMsg = { role: 'user', content: text };
  setMessages(prev => [...prev, userMsg]);

  const history = [...messages, userMsg].slice(-10);
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: history, context }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let assistantText = '';
  setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // parse SSE: lines starting with "data: "
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const token = line.slice(6);
      if (token === '[DONE]') break;
      if (token.startsWith('[ERROR]')) { /* show error */ break; }
      assistantText += token;
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: assistantText };
        return next;
      });
    }
  }
  setStreaming(false);
}
```

## Related Code Files

- **Create:** `src/web/components/ChatPanel.tsx`
- **Create:** `src/web/use-chat-context.ts`
- **Modify:** `src/web/use-dock.ts` — add `"chat"` to `PanelId` union
- **Modify:** `src/web/components/DockBar.tsx` — add Chat tab entry
- **Read:** `src/web/components/DockBar.tsx` — existing tab pattern to follow
- **Read:** `src/web/use-dock.ts` — current `PanelId` union

## Implementation Steps

1. **`src/web/use-dock.ts`** — add `| "chat"` to `PanelId` union:
   ```ts
   export type PanelId =
     | "paper" | "strategy" | "backtest"
     | "journal" | "alerts" | "watchlist"
     | "chat";   // ← add
   ```

2. **`src/web/use-chat-context.ts`** — hook assembling context snapshot:
   ```ts
   export interface ChatContext { symbol?: string; timeframe?: string; ... }

   export function useChatContext(symbol?: string, timeframe?: string): ChatContext {
     const [journalStats, setJournalStats] = useState<JournalStats>();
     useEffect(() => {
       fetch('/api/journal/stats').then(r => r.json()).then(setJournalStats).catch(() => {});
     }, []);
     return { symbol, timeframe, journalStats };
   }
   ```
   - `backtestResult`: passed as prop from parent (BacktestHub result, if available)
   - Keep it simple — don't lift backtest state for now; prop can be `undefined`

3. **`src/web/components/ChatPanel.tsx`** (~160 lines):
   - Props: `{ symbol?: string; timeframe?: string; backtestResult?: BacktestSummary }`
   - `useChatContext(symbol, timeframe)` for context
   - `useState<Message[]>([])` for history
   - `useState(false)` for `streaming`
   - Auto-scroll on new message (`useEffect` → `listRef.current?.scrollTo(...)`)
   - `<textarea>` with `onKeyDown`: Enter without Shift → submit
   - Style: follow existing panel glass styles (`panel-glass`, CSS vars for colors)

4. **`src/web/components/DockBar.tsx`** — add Chat entry to the tabs array:
   ```ts
   import { MessageCircle } from 'lucide-react';
   // in the tabs array:
   { id: 'chat', label: 'Chat', icon: MessageCircle },
   ```

5. **`App.tsx` or `Drawer.tsx`** — render `<ChatPanel>` when `activePanel === 'chat'`. Pass `symbol` and `timeframe` from feed state.

6. Compile check: `pnpm tsc --noEmit`

## Todo List

- [ ] Add `"chat"` to `PanelId` in `src/web/use-dock.ts`
- [ ] Create `src/web/use-chat-context.ts`
- [ ] Create `src/web/components/ChatPanel.tsx`
- [ ] Add Chat tab to `src/web/components/DockBar.tsx`
- [ ] Wire `<ChatPanel>` render in `App.tsx` / `Drawer.tsx`
- [ ] Compile check

## Success Criteria

- Chat tab visible in dock bar
- Typing a message and pressing Enter sends it and streams a response
- Response appears token-by-token in assistant bubble
- Input disabled while streaming, re-enabled on completion
- Clear button resets to empty history
- Active symbol shown in panel header when a chart is open

## Risk Assessment

- SSE parsing: `data: ` lines may be split across `read()` chunks — use a buffer string accumulator rather than splitting each chunk independently
- Auto-scroll: avoid forced scroll if user has scrolled up to read history
- `textarea` height: use `rows={1}` + CSS `max-height` + `overflow-y: auto` for auto-resize

## Security Considerations

- Messages sent to `/api/chat` go through the same server auth as all other API routes
- No user input rendered as raw HTML — use `textContent` / React children only
