import Anthropic from '@anthropic-ai/sdk';
import type { PromptSpec } from './agents.js';
import type { Stage } from './types.js';

// Lazy singleton — mirrors analyze.ts pattern
let client: Anthropic | null = null;
export function getCouncilClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Pricing (USD per 1M tokens)
const HAIKU_IN = 0.80;
const HAIKU_OUT = 4.00;
const SONNET_IN = 3.00;
const SONNET_OUT = 15.00;

function calcCost(model: string, inTok: number, outTok: number): number {
  if (model.startsWith('claude-haiku')) {
    return (inTok / 1_000_000) * HAIKU_IN + (outTok / 1_000_000) * HAIKU_OUT;
  }
  // Sonnet and fallback
  return (inTok / 1_000_000) * SONNET_IN + (outTok / 1_000_000) * SONNET_OUT;
}

export interface RunResult {
  text: string;
  toolInput?: unknown;
  inTok: number;
  outTok: number;
  costUsd: number;
}

/**
 * Execute a single Anthropic call from a PromptSpec.
 * Handles both plain-text and tool-use (PM stage).
 * Throws on API error — caller handles try/catch.
 */
export async function runPrompt(
  spec: PromptSpec,
  _stage: Stage,
  signal?: AbortSignal,
): Promise<RunResult> {
  const c = getCouncilClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set');

  // Build a non-streaming message request
  const baseParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: spec.model,
    max_tokens: spec.maxTokens,
    system: spec.system,
    messages: [{ role: 'user', content: spec.user }],
  };

  if (spec.tools && spec.tools.length > 0) {
    baseParams.tools = spec.tools as Anthropic.Tool[];
    baseParams.tool_choice = { type: 'tool', name: (spec.tools[0] as { name: string }).name };
  }

  // SDK doesn't expose AbortSignal natively; timeout handled in orchestrator via Promise.race
  void signal;

  const result: Anthropic.Message = await c.messages.create(baseParams);

  const inTok = result.usage.input_tokens;
  const outTok = result.usage.output_tokens;
  const costUsd = calcCost(spec.model, inTok, outTok);

  // Extract text from text blocks
  const text = result.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // Extract tool_use input if present
  const toolBlock = result.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  const toolInput = toolBlock?.input;

  return { text, toolInput, inTok, outTok, costUsd };
}
