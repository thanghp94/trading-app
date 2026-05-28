import { useEffect, useRef, useState } from "react";
import { Drawer } from "./Drawer.js";
import { useChatContext } from "../use-chat-context.js";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  symbol?: string;
  timeframe?: string;
}

export function ChatPanel({
  open,
  onClose,
  symbol,
  timeframe,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const context = useChatContext(symbol, timeframe, "chat");

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    // Slide window: last 10 messages sent to API
    const history = [...messages, userMsg].slice(-10);

    // Append placeholder for streaming assistant message
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let leftover = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Accumulate and parse SSE lines
        const chunk = leftover + decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        // Last element may be incomplete — carry it forward
        leftover = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const token = line.slice(6);
          if (token === "[DONE]") break;
          if (token.startsWith("[ERROR]")) {
            assistantText = token.slice(8) || "AI provider error";
            break;
          }
          // Restore escaped newlines from server
          assistantText += token.replace(/\\n/g, "\n");
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              content: assistantText,
            };
            return next;
          });
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: `Error: ${(err as Error).message}`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const clearButton = (
    <button
      type="button"
      onClick={() => setMessages([])}
      style={clearBtnStyle}
      title="Clear chat"
    >
      Clear
    </button>
  );

  return (
    <Drawer
      open={open}
      title={symbol ? `Chat — ${symbol}` : "Chat"}
      hint="Ask about backtest results, indicators, or trading concepts"
      onClose={onClose}
      width={400}
      extraHeaderContent={clearButton}
    >
      <div style={containerStyle}>
        {/* Message list */}
        <div ref={listRef} style={listStyle}>
          {messages.length === 0 && (
            <div style={emptyStyle}>
              Ask me anything — what does Sharpe ratio mean, how does the
              backtest work, what is a wave-3 entry…
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {streaming && messages[messages.length - 1]?.content === "" && (
            <TypingIndicator />
          )}
        </div>

        {/* Input row */}
        <div style={inputRowStyle}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            placeholder="Ask a question… (Enter to send)"
            rows={1}
            style={textareaStyle}
          />
          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim()}
            style={sendBtnStyle}
          >
            Send
          </button>
        </div>
      </div>
    </Drawer>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        ...bubbleRowStyle,
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          ...bubbleStyle,
          ...(isUser ? userBubbleStyle : aiBubbleStyle),
        }}
      >
        {message.content || <span style={{ opacity: 0.4 }}>…</span>}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ ...bubbleRowStyle, justifyContent: "flex-start" }}>
      <div style={{ ...bubbleStyle, ...aiBubbleStyle }}>
        <span style={dotStyle}>●</span>
        <span style={{ ...dotStyle, animationDelay: "0.2s" }}>●</span>
        <span style={{ ...dotStyle, animationDelay: "0.4s" }}>●</span>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  gap: 0,
};
const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const emptyStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 12,
  lineHeight: 1.5,
  padding: "8px 0",
};
const inputRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  padding: "8px 12px",
  borderTop: "1px solid var(--border-color)",
  alignItems: "flex-end",
};
const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: "none",
  background: "var(--bg-input, var(--bg-panel))",
  color: "var(--text-main)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
  fontFamily: "inherit",
  lineHeight: 1.4,
  maxHeight: 80,
  overflowY: "auto",
  outline: "none",
};
const sendBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  fontFamily: "inherit",
  background: "var(--accent)",
  color: "#000",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const clearBtnStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "inherit",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
  padding: "2px 7px",
  cursor: "pointer",
};
const bubbleRowStyle: React.CSSProperties = {
  display: "flex",
};
const bubbleStyle: React.CSSProperties = {
  maxWidth: "82%",
  padding: "7px 10px",
  borderRadius: 10,
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const userBubbleStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "#000",
  borderBottomRightRadius: 3,
};
const aiBubbleStyle: React.CSSProperties = {
  background: "var(--bg-panel-solid)",
  color: "var(--text-main)",
  border: "1px solid var(--border-color)",
  borderBottomLeftRadius: 3,
};
const dotStyle: React.CSSProperties = {
  fontSize: 8,
  animation: "pulse 1.2s ease-in-out infinite",
  display: "inline-block",
  marginRight: 2,
};
