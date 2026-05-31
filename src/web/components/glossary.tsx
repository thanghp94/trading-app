import { useState } from 'react';

/**
 * Hover/click tooltips for backtest jargon. Single source of truth for
 * definitions so the per-term help icon stays consistent across panels.
 */
export const GLOSSARY: Record<string, string> = {
  // Core trading concepts
  'r-multiple': 'R-multiple. Profit/loss expressed as a multiple of the initial risk (distance from entry to stop). +2R = won twice what you risked. −1R = full stop hit.',
  'sl': 'Stop Loss. The price at which you cut a losing trade. Defines your risk.',
  'tp': 'Take Profit. The price at which you book the win.',
  'rr': 'Reward-to-Risk ratio. TP distance ÷ SL distance. R:R=2 means you risk $1 to make $2.',
  'atr': 'Average True Range. Typical bar-to-bar price movement over 14 bars. Measures volatility — used to size SL buffers.',
  'ema': 'Exponential Moving Average. Smoothed average that weights recent bars more heavily.',
  'pivot': 'Local high or low (swing point). Used as building blocks for S/R zones and wave counts.',

  // Strategy-specific
  'mtf': 'Multi-TimeFrame. Cross-checks the higher timeframe before entering. E.g. a 5m long needs the 1h trend to also be up.',
  'htf': 'Higher Time Frame. The longer-period chart used for context.',
  'zone': 'Support/Resistance zone — a price band where price has reacted multiple times before.',
  'confluence': 'Multiple independent signals agreeing at the same level. Increases probability.',
  'wave-5-entry': 'The ★ preferred entry. After a clean 1-2-3-4 impulse, enter on the wave-5 push into prior resistance.',
  'preferred-only': 'When ON, only ★ wave-5 entries spawn trades. Filters out the noisier zone-touch and pattern alerts.',
  'trigger-wick': 'SL placement at the LOW (long) or HIGH (short) of the impulse-trigger candle, minus a small ATR buffer. Matches the documented technique.',
  'next-resistance': 'TP placement at the nearest active S/R zone in the trade direction. Matches "exit just below the next resistance".',

  // Realism
  'fee-bps': 'Per-side commission in basis points (1 bp = 0.01%). VN HOSE retail ≈ 15 bps. Applied on entry AND exit.',
  'sell-tax-bps': 'Additional sell-side tax. VN HOSE personal income tax on sale value ≈ 10 bps.',
  'lot-size': 'Minimum shares per trade. VN equity = 100. Futures/crypto = 1. Position sizes round DOWN to the nearest lot.',
  't+': 'Settlement gate. VN cash equity is T+2.5 — you can\'t sell what you just bought for ~3 trading days. SL/TP checks suppressed during this window.',
  'session-filter': 'Drops intraday alerts that fire outside HOSE trading hours (09:00–11:30 + 13:00–14:45 Vietnam time). Lunch-break entries can\'t fill in real life.',

  // Active mgmt
  'breakeven': 'Move SL to entry price after price moves +N×R in your favor. Trade becomes "free" — worst case you scratch.',
  'partial': 'Take part of the position off at +N×R, let runner go for full TP. Smooths equity curve.',
  'trail': 'Trailing stop. Follows favorable price by N×ATR. Once active, locks in gains as trend extends.',

  // Stats
  'win-rate': 'Wins ÷ (wins + losses). Excludes breakeven and time-stop trades from the denominator.',
  'avg-r': 'Average R-multiple across all trades. >0.3R is generally considered tradeable.',
  'sum-r': 'Sum of all R-multiples. Total profit in R units, before fees and position-sizing effects.',
  'max-dd': 'Maximum peak-to-trough drawdown of the equity curve, as a %. Survival metric — small accounts can\'t survive 50% DD.',
  'walk-forward': 'Train/test split. Run config on first 70% of history (in-sample), then 30% it\'s never seen (out-of-sample). Big drop = overfit.',
  'overfit': 'When a config that looks great in backtest only works because it was tuned to that specific history. Walk-forward exposes this.',
  'monte-carlo': 'Shuffle the order of historical trades many times, see how often you\'d blow up. Tests whether your equity curve depends on luck.',
};

interface TooltipProps {
  /** Key in GLOSSARY, or raw markdown string. */
  termKey: string;
  /** Optional override of the icon label. Default: (?) */
  icon?: string;
  inline?: boolean;
}

/**
 * Inline ⓘ icon. Hover shows the glossary entry. Falls back to the termKey
 * if no glossary match (so missing entries are obvious in dev).
 */
export function Help({ termKey, icon = 'ⓘ' }: TooltipProps) {
  const [show, setShow] = useState(false);
  const def = GLOSSARY[termKey] ?? `(no definition for "${termKey}")`;
  return (
    <span
      style={{ position: 'relative', display: 'inline-block', cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{ color: '#6e7681', fontSize: 10, marginLeft: 2 }}>{icon}</span>
      {show && (
        <span
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 2,
            zIndex: 200,
            width: 240,
            padding: '6px 8px',
            background: '#0d1117',
            color: '#c9d1d9',
            border: '1px solid #388bfd',
            borderRadius: 3,
            fontSize: 10,
            lineHeight: 1.4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
            textTransform: 'none',
            fontWeight: 400,
            fontFamily: 'inherit',
          }}
        >
          {def}
        </span>
      )}
    </span>
  );
}
