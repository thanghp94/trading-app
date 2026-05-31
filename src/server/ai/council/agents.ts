import type {
  CouncilContext,
  AnalystOutput,
  DebateRound,
  RiskVerdict,
} from "./types.js";
import { fmtPrice } from "../../alerts/fmt-price.js";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-6-20251001";

export type PromptSpec = {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  tools?: unknown[];
};

// Shared compact context snippet to reduce boilerplate across builders
function ctxSnippet(ctx: CouncilContext): string {
  const last = ctx.recentCandles[ctx.recentCandles.length - 1];
  const active = ctx.zones.filter((z) => z.state === "active");
  const activeWave = ctx.waves.find((w) => w.active);
  const bars = ctx.recentCandles
    .slice(-20)
    .map(
      (b) =>
        `${new Date(b.time * 1000).toISOString().slice(0, 16)}: O${b.open} H${b.high} L${b.low} C${b.close} V${Math.round(b.volume)}`,
    )
    .join("\n");
  return (
    `Symbol: ${ctx.symbol} ${ctx.timeframe}\n` +
    `Last close: ${last?.close ?? "N/A"} at ${last ? new Date(last.time * 1000).toISOString().slice(0, 16) : "N/A"} UTC\n` +
    `Last 20 candles:\n${bars}\n\n` +
    `Active S/R zones: ${active.length === 0 ? "(none)" : active.map((z) => `${fmtPrice(z.bottom, ctx.symbol)}..${fmtPrice(z.top, ctx.symbol)} ${z.type}`).join(", ")}\n` +
    `Active wave: ${activeWave ? `${activeWave.direction} pts: ${activeWave.points.map((p) => `${p.label}@${fmtPrice(p.price, ctx.symbol)}`).join("→")}` : "(none)"}\n` +
    `MTF: ${ctx.mtf ? `trend=${ctx.mtf.trend} zone=${ctx.mtf.zone} htf=${ctx.mtf.htf}` : "n/a"}`
  );
}

const STUB_INSTRUCTION = `If you have no real data for this symbol, return exactly the string "data unavailable" — do NOT fabricate.`;

export function analystTechnical(ctx: CouncilContext): PromptSpec {
  return {
    model: HAIKU_MODEL,
    maxTokens: 350,
    system:
      "You are a senior technical analyst. Be terse, cite exact prices. 5-8 sentences.",
    user: `Perform a technical analysis reading.\n\n${ctxSnippet(ctx)}`,
  };
}

/** Compact fundamentals + ownership block for the analyst prompt. Omits nulls. */
export function fundamentalSummary(ctx: CouncilContext): string {
  const f = ctx.fundamentals;
  if (!f) return "";
  const v = f.valuation;
  const ratio = (n: number | null) => (n == null ? null : n.toFixed(2));
  const pct = (n: number | null) =>
    n == null ? null : `${(n * 100).toFixed(1)}%`;
  const ty = (n: number | null) =>
    n == null ? null : `${Math.round(n / 1e9).toLocaleString("en-US")} tỷ`;

  const valuation = [
    ratio(v.pe) && `P/E ${ratio(v.pe)}`,
    ratio(v.pb) && `P/B ${ratio(v.pb)}`,
    pct(v.roe) && `ROE ${pct(v.roe)}`,
    v.eps != null && `EPS ${Math.round(v.eps).toLocaleString("en-US")}`,
    ty(v.marketCap) && `Vốn hóa ${ty(v.marketCap)}`,
    pct(v.dividendYield) && `Cổ tức ${pct(v.dividendYield)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = [valuation && `Định giá: ${valuation}`];

  const q = f.statements[0];
  if (q) {
    const stmt = [
      ty(q.revenue) && `Doanh thu ${ty(q.revenue)}`,
      ty(q.netProfit) && `LNST ${ty(q.netProfit)}`,
    ]
      .filter(Boolean)
      .join(" · ");
    if (stmt) lines.push(`Quý ${q.period}: ${stmt}`);
  }

  const o = ctx.ownership;
  if (o) {
    const top = o.shareholders
      .slice(0, 3)
      .map((s) => `${s.name ?? "?"} ${pct(s.pct) ?? "—"}`)
      .join(", ");
    if (top) lines.push(`Cổ đông lớn: ${top}`);
    const struct = [
      pct(o.structure.foreignPct) && `NN ${pct(o.structure.foreignPct)}`,
      pct(o.structure.freeFloatPct) &&
        `Free-float ${pct(o.structure.freeFloatPct)}`,
    ]
      .filter(Boolean)
      .join(" · ");
    if (struct) lines.push(`Sở hữu: ${struct}`);
  }

  return lines.filter(Boolean).join("\n");
}

export function analystFundamental(ctx: CouncilContext): PromptSpec {
  const summary = fundamentalSummary(ctx);
  if (!summary) {
    // Crypto / non-VN / uncached — no fundamentals feed for this symbol.
    return {
      model: HAIKU_MODEL,
      maxTokens: 300,
      system: `You are a fundamental analyst. ${STUB_INSTRUCTION} Your notes field MUST include the string "data unavailable" since no real fundamental data is available for this symbol.`,
      user: `Provide fundamental analysis for ${ctx.symbol}. No fundamental data is available — respond with your notes including "data unavailable".`,
    };
  }
  return {
    model: HAIKU_MODEL,
    maxTokens: 300,
    system: `You are a fundamental analyst for VN equities. Be terse, cite the figures, 5-8 sentences. Assess valuation (P/E, P/B vs ROE), profitability, and ownership quality. ${STUB_INSTRUCTION}`,
    user: `Fundamental analysis for ${ctx.symbol}.\n\n${summary}`,
  };
}

export function analystNews(ctx: CouncilContext): PromptSpec {
  return {
    model: HAIKU_MODEL,
    maxTokens: 300,
    system: `You are a news sentiment analyst. ${STUB_INSTRUCTION} Your notes field MUST include the string "data unavailable" since no news feed is connected.`,
    user: `Summarize recent news for ${ctx.symbol}. No news feed connected — respond with notes including "data unavailable".`,
  };
}

export function analystSentiment(ctx: CouncilContext): PromptSpec {
  return {
    model: HAIKU_MODEL,
    maxTokens: 300,
    system: `You are a market sentiment analyst (COT, funding rates, options). ${STUB_INSTRUCTION} Your notes field MUST include the string "data unavailable" since no sentiment feed is connected.`,
    user: `Assess market sentiment for ${ctx.symbol}. No sentiment feed connected — respond with notes including "data unavailable".`,
  };
}

export function bull(
  ctx: CouncilContext,
  analysts: AnalystOutput[],
): PromptSpec {
  const summaries = analysts
    .map((a) => `[${a.stage}]: ${a.text.slice(0, 200)}`)
    .join("\n");
  return {
    model: HAIKU_MODEL,
    maxTokens: 350,
    system:
      "You are the BULL advocate in a structured debate. Argue the strongest long case from the analyst reports. Be concrete — cite prices and zones.",
    user: `Analyst reports:\n${summaries}\n\nContext:\n${ctxSnippet(ctx)}\n\nArgue the long case.`,
  };
}

export function bear(
  ctx: CouncilContext,
  analysts: AnalystOutput[],
): PromptSpec {
  const summaries = analysts
    .map((a) => `[${a.stage}]: ${a.text.slice(0, 200)}`)
    .join("\n");
  return {
    model: HAIKU_MODEL,
    maxTokens: 350,
    system:
      "You are the BEAR advocate in a structured debate. Argue the strongest short/avoid case from the analyst reports. Be concrete — cite prices and zones.",
    user: `Analyst reports:\n${summaries}\n\nContext:\n${ctxSnippet(ctx)}\n\nArgue the short/avoid case.`,
  };
}

export function researchManager(
  ctx: CouncilContext,
  analysts: AnalystOutput[],
  debate: DebateRound,
): PromptSpec {
  const summaries = analysts
    .map((a) => `[${a.stage}]: ${a.text.slice(0, 150)}`)
    .join("\n");
  return {
    model: HAIKU_MODEL,
    maxTokens: 400,
    system:
      "You are the Research Manager. Synthesize the analyst reports and debate into a balanced, evidence-based view. No position recommendation yet.",
    user: `Analysts:\n${summaries}\n\nBull case:\n${debate.bull}\n\nBear case:\n${debate.bear}\n\nContext:\n${ctxSnippet(ctx)}\n\nSynthesize.`,
  };
}

export function trader(ctx: CouncilContext, manager: string): PromptSpec {
  return {
    model: HAIKU_MODEL,
    maxTokens: 350,
    system:
      "You are the Trader. Based on the research synthesis, propose ONE concrete trade setup with entry, SL, TP prices and size rationale. Be specific — exact prices.",
    user: `Research synthesis:\n${manager}\n\nContext:\n${ctxSnippet(ctx)}\n\nPropose the trade setup.`,
  };
}

export function riskAggressive(
  ctx: CouncilContext,
  proposal: string,
): PromptSpec {
  return {
    model: HAIKU_MODEL,
    maxTokens: 300,
    system:
      "You are the AGGRESSIVE risk persona (high risk tolerance). Evaluate the trade proposal — lean toward participation. State your verdict clearly.",
    user: `Trade proposal:\n${proposal}\n\nContext:\n${ctxSnippet(ctx)}\n\nAggressive risk verdict.`,
  };
}

export function riskNeutral(ctx: CouncilContext, proposal: string): PromptSpec {
  return {
    model: HAIKU_MODEL,
    maxTokens: 300,
    system:
      "You are the NEUTRAL risk persona (balanced risk/reward). Evaluate the trade proposal objectively. State your verdict clearly.",
    user: `Trade proposal:\n${proposal}\n\nContext:\n${ctxSnippet(ctx)}\n\nNeutral risk verdict.`,
  };
}

export function riskConservative(
  ctx: CouncilContext,
  proposal: string,
): PromptSpec {
  return {
    model: HAIKU_MODEL,
    maxTokens: 300,
    system:
      "You are the CONSERVATIVE risk persona (low risk tolerance). Evaluate the trade proposal — prefer capital preservation. State your verdict clearly.",
    user: `Trade proposal:\n${proposal}\n\nContext:\n${ctxSnippet(ctx)}\n\nConservative risk verdict.`,
  };
}

// PM tool schema mirrors PMDecision exactly
const PM_TOOL_SCHEMA = {
  type: "object" as const,
  required: ["action", "confidence", "sizePct", "tp", "sl", "rationale"],
  properties: {
    action: {
      type: "string",
      enum: ["increase", "hold", "decrease", "no_trade"],
    },
    confidence: { type: "string", enum: ["low", "med", "high"] },
    sizePct: {
      type: "number",
      description: "Position size as % of portfolio (0-100)",
    },
    tp: { type: "number", description: "Take-profit price" },
    sl: { type: "number", description: "Stop-loss price" },
    rationale: {
      type: "string",
      description: "One-paragraph decision rationale",
    },
  },
};

export const PM_TOOL_NAME = "submit_decision";

export function portfolioManager(
  ctx: CouncilContext,
  proposal: string,
  risk: RiskVerdict[],
): PromptSpec {
  const riskSummaries = risk
    .map((r) => `[${r.persona}]: ${r.text.slice(0, 200)}`)
    .join("\n");
  return {
    model: SONNET_MODEL,
    maxTokens: 500,
    system:
      "You are the Portfolio Manager. Make the final capital allocation decision using the submit_decision tool. Weigh all risk verdicts and the trade proposal.",
    user: `Trade proposal:\n${proposal}\n\nRisk verdicts:\n${riskSummaries}\n\nContext:\n${ctxSnippet(ctx)}\n\nSubmit your final decision via the tool.`,
    tools: [
      {
        name: PM_TOOL_NAME,
        description: "Submit the final portfolio allocation decision.",
        input_schema: PM_TOOL_SCHEMA,
      },
    ],
  };
}
