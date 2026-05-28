import type { FastifyInstance } from "fastify";
import {
  streamChat,
  type ChatMessage,
  type ChatContext,
} from "./provider-router.js";

interface ChatBody {
  messages: ChatMessage[];
  context?: ChatContext;
}

const VALID_ROLES = new Set(["user", "assistant"]);
const MAX_CONTENT_LEN = 4000;

export async function registerChatRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ChatBody }>("/api/chat", async (req, reply) => {
    // Match the same optional bearer-token auth used by the WebSocket endpoint
    const authToken = process.env.APP_AUTH_TOKEN;
    if (authToken) {
      const provided = (req.headers["authorization"] ?? "").replace(
        /^Bearer\s+/i,
        "",
      );
      if (provided !== authToken) {
        return reply.status(401).send({ error: "unauthorized" });
      }
    }

    const { messages, context } = req.body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({ error: "messages array required" });
    }

    // Safety clamp — client should send ≤10 but enforce server-side
    const trimmed = messages.slice(-10);

    // Reject unknown roles and oversized content to prevent prompt injection
    const invalid = trimmed.some(
      (m) =>
        !VALID_ROLES.has(m.role) ||
        typeof m.content !== "string" ||
        m.content.length > MAX_CONTENT_LEN,
    );
    if (invalid) {
      return reply.status(400).send({ error: "invalid message format" });
    }

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    const controller = new AbortController();
    req.raw.on("close", () => controller.abort());

    try {
      for await (const token of streamChat(
        trimmed,
        context,
        controller.signal,
      )) {
        if (controller.signal.aborted) break;
        // Escape newlines in token so each SSE data line is well-formed
        reply.raw.write(`data: ${token.replace(/\n/g, "\\n")}\n\n`);
      }
      reply.raw.write("data: [DONE]\n\n");
    } catch (err) {
      const msg = (err as Error).message ?? "AI provider error";
      reply.raw.write(`data: [ERROR] ${msg}\n\n`);
    } finally {
      reply.raw.end();
    }
  });
}
