/** Fundamentals domain types — valuation snapshot + quarterly statement summaries. */

export interface Valuation {
  symbol: string;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
  marketCap: number | null;
  dividendYield: number | null;
  asOf: number; // epoch ms when fetched
}

export interface FinancialStatement {
  period: string; // "2025-Q1"
  revenue: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
  operatingCashflow: number | null;
}

export interface Fundamentals {
  valuation: Valuation;
  statements: FinancialStatement[];
}

/** Raw JSON shape emitted by scripts/vnstock-fundamentals.py (no symbol/asOf). */
export interface RawFundamentals {
  valuation: {
    pe: number | null;
    pb: number | null;
    roe: number | null;
    eps: number | null;
    marketCap: number | null;
    dividendYield: number | null;
  };
  statements: FinancialStatement[];
}
