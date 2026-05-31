import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getCouncilClient } from "./council/anthropic-runner.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
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
}

type ProviderName = "anthropic" | "openai" | "groq" | "deepseek";

interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  model: string;
  baseURL?: string;
}

// ─── Provider defaults ────────────────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<
  ProviderName,
  { model: string; baseURL?: string }
> = {
  anthropic: { model: "claude-haiku-4-5-20251001" },
  openai: { model: "gpt-4o-mini" },
  groq: {
    model: "llama-3.3-70b-versatile",
    baseURL: "https://api.groq.com/openai/v1",
  },
  deepseek: {
    model: "deepseek-chat",
    baseURL: "https://api.deepseek.com",
  },
};

const KEY_ENV: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx?: ChatContext): string {
  let prompt =
    `You are a trading assistant embedded in a personal trading app. ` +
    `Help the user understand: (1) how the app works and what each parameter means, ` +
    `(2) backtest metrics like Sharpe ratio, max drawdown, win rate, R:R, ` +
    `(3) trading concepts such as support/resistance zones, wave theory, trend, position sizing. ` +
    `Be concise and practical. When context data is provided, reference it specifically. ` +
    `Never give financial advice or tell the user to buy/sell a specific asset. ` +
    `Answer in the same language the user writes in (English or Vietnamese).`;

  if (ctx?.symbol) {
    prompt += `\n\nCurrent context — Symbol: ${ctx.symbol}${ctx.timeframe ? ` ${ctx.timeframe}` : ""}`;
  }
  if (ctx?.backtestResult) {
    const b = ctx.backtestResult;
    prompt +=
      `\nLast backtest: ${b.totalTrades} trades, win rate ${b.winRate.toFixed(1)}%, ` +
      `Sharpe ${b.sharpe.toFixed(2)}, max drawdown ${b.maxDrawdown.toFixed(1)}%, PnL ${b.pnl.toFixed(2)}`;
  }
  if (ctx?.journalStats) {
    const j = ctx.journalStats;
    prompt += `\nJournal: ${j.totalTrades} trades, win rate ${j.winRate.toFixed(1)}%, avg R:R ${j.avgRR.toFixed(2)}`;
  }
  if (ctx?.activePanel) {
    prompt += `\nUser is viewing: ${ctx.activePanel} panel`;
  }

  return prompt;
}

// ─── Provider chain builder ───────────────────────────────────────────────────

function buildProviderChain(): ProviderConfig[] {
  const order = (process.env.AI_CHAT_PROVIDERS ?? "anthropic")
    .split(",")
    .map((s) => s.trim().toLowerCase()) as ProviderName[];

  return order.flatMap((name) => {
    if (!(name in PROVIDER_DEFAULTS)) return [];
    const apiKey = process.env[KEY_ENV[name]];
    if (!apiKey) return [];
    return [{ name, apiKey, ...PROVIDER_DEFAULTS[name] }];
  });
}

// ─── Per-provider stream functions ───────────────────────────────────────────

async function* streamAnthropic(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  ctx: ChatContext | undefined,
  signal?: AbortSignal,
): AsyncIterable<string> {
  void cfg; // key managed by getCouncilClient singleton
  const client = getCouncilClient();
  if (!client) throw new Error("Anthropic API key not set");

  const stream = client.messages.stream(
    {
      model: PROVIDER_DEFAULTS.anthropic.model,
      max_tokens: 1024,
      system: buildSystemPrompt(ctx),
      messages: messages as Anthropic.MessageParam[],
    },
    { signal },
  );

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

async function* streamOpenAI(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  ctx: ChatContext | undefined,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
  });

  const stream = await client.chat.completions.create(
    {
      model: cfg.model,
      stream: true,
      messages: [
        { role: "system", content: buildSystemPrompt(ctx) },
        ...(messages as OpenAI.ChatCompletionMessageParam[]),
      ],
    },
    { signal },
  );

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) yield text;
  }
}

// ─── Exported router ──────────────────────────────────────────────────────────

/**
 * Streams chat tokens from the first available AI provider.
 * Tries providers in AI_CHAT_PROVIDERS order, falls back on error.
 * Throws if all providers fail or none are configured.
 */
export async function* streamChat(
  messages: ChatMessage[],
  ctx: ChatContext | undefined,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const chain = buildProviderChain();
  if (chain.length === 0) {
    throw new Error(
      "No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY in .env",
    );
  }

  let lastError: Error | undefined;

  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    let emittedAny = false;
    try {
      const stream =
        provider.name === "anthropic"
          ? streamAnthropic(provider, messages, ctx, signal)
          : streamOpenAI(provider, messages, ctx, signal);

      for await (const token of stream) {
        emittedAny = true;
        yield token;
      }
      return; // success — stop trying further providers
    } catch (err) {
      lastError = err as Error;
      // If we already sent tokens to the client, don't attempt fallback —
      // mixing partial responses from two providers would garble the output.
      if (emittedAny) throw lastError;
      const isLast = i === chain.length - 1;
      if (!isLast) {
        console.warn(
          `[ai-router] ${provider.name} failed (${lastError.message}), trying next provider`,
        );
      }
    }
  }

  throw lastError ?? new Error("All AI providers failed");
}
