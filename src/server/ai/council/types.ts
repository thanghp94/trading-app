import type { Candle, Timeframe } from "../../../shared/types.js";
import type { Zone } from "../../../shared/types.js";
import type { WaveCount } from "../../../shared/indicators/wave-counter.js";
import type { MtfCheck } from "../../../shared/indicators/mtf.js";
import type { Fundamentals } from "../../fundamentals/types.js";
import type { Ownership } from "../../fundamentals/ownership-types.js";

export type Stage =
  | "analyst-technical"
  | "analyst-fundamental"
  | "analyst-news"
  | "analyst-sentiment"
  | "bull"
  | "bear"
  | "research-manager"
  | "trader"
  | "risk-aggressive"
  | "risk-neutral"
  | "risk-conservative"
  | "portfolio-manager";

export interface CouncilContext {
  symbol: string;
  timeframe: Timeframe;
  lastCandleTime: number;
  recentCandles: Candle[];
  zones: Zone[];
  waves: WaveCount[];
  mtf: MtfCheck | null;
  /** Cached fundamentals (VN equities only); null for crypto / cache-miss. */
  fundamentals?: Fundamentals | null;
  /** Cached ownership (VN equities only); null for crypto / cache-miss. */
  ownership?: Ownership | null;
}

export interface AnalystOutput {
  stage: Stage;
  text: string;
  dataAvailable: boolean;
}

export interface DebateRound {
  bull: string;
  bear: string;
}

export interface RiskVerdict {
  persona: "aggressive" | "neutral" | "conservative";
  text: string;
}

export interface PMDecision {
  action: "increase" | "hold" | "decrease" | "no_trade";
  confidence: "low" | "med" | "high";
  sizePct: number;
  tp: number;
  sl: number;
  rationale: string;
}

export interface CostLedger {
  entries: Array<{
    stage: Stage;
    model: string;
    inTok: number;
    outTok: number;
    costUsd: number;
  }>;
  totalUsd: number;
}

export interface CouncilReport {
  symbol: string;
  timeframe: Timeframe;
  cachedAt: number;
  analysts: AnalystOutput[];
  debate: DebateRound;
  manager: string;
  trader: string;
  risk: RiskVerdict[];
  pm: PMDecision;
  /** True when a hard gate overrode the PM's raw decision (e.g. low confidence forced no_trade). */
  gated: boolean;
  cost: CostLedger;
}
