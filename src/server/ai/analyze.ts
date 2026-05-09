import Anthropic from '@anthropic-ai/sdk';
import type { Candle, Timeframe, Zone } from '../../shared/types.js';
import type { WaveCount } from '../../shared/indicators/wave-counter.js';

interface AnalyzeRequest {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  zones: Zone[];
  waves: WaveCount[];
}

export interface AnalyzeResponse {
  ok: boolean;
  text?: string;
  error?: string;
  /** Approximate cost in USD for this call. */
  costUsd?: number;
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * "Analyze the chart" — sends a compact summary of recent state to Claude
 * Haiku and gets back a plain-English read on the setup.
 *
 * Cost calibration: Haiku is ~$0.80 / MTok input, $4 / MTok output.
 * A typical call here is ~600 input tokens + ~250 output tokens =
 * ~$0.0015 per analysis. Cache hits drop this further.
 *
 * The prompt is heavily compressed: only the last 30 closed candles +
 * the active wave count + the active zones. Including 1000 raw bars
 * would 10x the cost without adding signal.
 */
export async function analyzeChart(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const c = getClient();
  if (!c) return { ok: false, error: 'ANTHROPIC_API_KEY is not set in .env' };

  const recent = req.candles.slice(-30);
  const last = recent[recent.length - 1];
  const active = req.zones.filter((z) => z.state === 'active');
  const broken = req.zones.filter((z) => z.state === 'broken');
  const activeWave = req.waves.find((w) => w.active);

  const systemPrompt =
    `You are an experienced technical analyst reading a single chart. Be terse, concrete, ` +
    `and actionable. No disclaimers about not being a financial advisor — the user is a personal ` +
    `trader who already knows that. 4–6 short sentences max. Reference exact prices and zone bounds. ` +
    `If the user's specific setup (strong impulse + 0-1-2-3-4-5 waves entered on the 2→3 and 4→5 legs) ` +
    `is forming or invalidated, say so directly.`;

  const userPrompt =
    `Symbol: ${req.symbol} ${req.timeframe}\n` +
    `Last close: ${last.close} at ${new Date(last.time * 1000).toISOString().slice(0, 16)} UTC\n\n` +
    `Last 30 closed candles (open, high, low, close, vol):\n` +
    recent
      .map((b) => `${new Date(b.time * 1000).toISOString().slice(0, 16)}: ${b.open} ${b.high} ${b.low} ${b.close} ${Math.round(b.volume)}`)
      .join('\n') +
    `\n\nActive S/R zones (price-bottom..price-top, type):\n` +
    (active.length === 0
      ? '(none)'
      : active.map((z) => `${z.bottom.toFixed(4)}..${z.top.toFixed(4)} ${z.type}${z.flipped ? ' (flipped)' : ''}`).join('\n')) +
    `\n\nBroken zones (recently broken — possible role-reversal candidates):\n` +
    (broken.length === 0
      ? '(none)'
      : broken.slice(-3).map((z) => `${z.bottom.toFixed(4)}..${z.top.toFixed(4)} was-${z.type}`).join('\n')) +
    `\n\nActive wave count:\n` +
    (!activeWave
      ? '(none)'
      : `${activeWave.direction} setup, points so far: ${activeWave.points.map((p) => `${p.label}@${p.price.toFixed(4)}`).join(' → ')}`) +
    `\n\nGive me your read.`;

  try {
    const result = await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const inTok = result.usage.input_tokens;
    const outTok = result.usage.output_tokens;
    const costUsd = (inTok / 1_000_000) * 0.8 + (outTok / 1_000_000) * 4;
    return { ok: true, text, costUsd };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
