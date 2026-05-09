import { useState } from 'react';
import type { Candle, Timeframe } from '../../shared/types.js';

interface BacktestPanelProps {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
}

interface BacktestResult {
  trades: Array<{ entry: number; exit: number; rMultiple: number; outcome: string }>;
  equity: Array<{ time: number; balance: number }>;
  stats: {
    total: number;
    wins: number;
    losses: number;
    breakeven: number;
    timeStops: number;
    winRate: number;
    avgR: number;
    bestR: number;
    worstR: number;
    sumR: number;
    maxDrawdownPct: number;
    finalBalance: number;
    pnlPct: number;
  };
}

/**
 * Backtest controls + result panel. Sends the cell's current candle history
 * to /api/backtest with user-set SL/TP/R-target/risk parameters, gets back
 * a summary + equity curve, renders both.
 */
export function BacktestPanel(props: BacktestPanelProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slPct, setSlPct] = useState('0.5');
  const [rrTarget, setRrTarget] = useState('2');
  const [maxBars, setMaxBars] = useState('30');
  const [riskPct, setRiskPct] = useState('1');
  const [result, setResult] = useState<BacktestResult | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: props.symbol,
          timeframe: props.timeframe,
          candles: props.candles,
          slPct: Number(slPct) / 100,
          rrTarget: Number(rrTarget),
          maxBars: Number(maxBars),
          riskPct: Number(riskPct),
          startingBalance: 10_000,
        }),
      });
      const json = (await res.json()) as BacktestResult;
      setResult(json);
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Backtest the rules against this chart's history"
        style={{ ...btnStyle, ...(open ? activeBtnStyle : {}) }}
      >
        📈 Backtest
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <span>{props.symbol} {props.timeframe} — Backtest</span>
            <button type="button" onClick={() => setOpen(false)} style={closeBtnStyle}>×</button>
          </div>
          <div style={paramsStyle}>
            <Field label="SL %"><input type="number" step="any" value={slPct} onChange={(e) => setSlPct(e.target.value)} style={inputStyle} /></Field>
            <Field label="R:R"><input type="number" step="any" value={rrTarget} onChange={(e) => setRrTarget(e.target.value)} style={inputStyle} /></Field>
            <Field label="Max bars"><input type="number" value={maxBars} onChange={(e) => setMaxBars(e.target.value)} style={inputStyle} /></Field>
            <Field label="Risk %"><input type="number" step="any" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} style={inputStyle} /></Field>
            <button type="button" onClick={run} disabled={busy} style={runBtnStyle}>
              {busy ? 'Running…' : 'Run backtest'}
            </button>
          </div>
          {result && (
            <div style={resultStyle}>
              <div style={statRowStyle}>
                <span><b>{result.stats.total}</b> trades</span>
                <span><span style={{ color: '#26a69a' }}>{result.stats.wins}W</span> · <span style={{ color: '#ef5350' }}>{result.stats.losses}L</span> · {result.stats.breakeven}BE · {result.stats.timeStops}TS</span>
              </div>
              <div style={statRowStyle}>
                <span>Win {(result.stats.winRate * 100).toFixed(1)}%</span>
                <span>Avg <b>{result.stats.avgR.toFixed(2)}R</b></span>
                <span>Best {result.stats.bestR.toFixed(2)}R · Worst {result.stats.worstR.toFixed(2)}R</span>
              </div>
              <div style={statRowStyle}>
                <span>Final ${result.stats.finalBalance.toFixed(0)} (<b style={{ color: result.stats.pnlPct >= 0 ? '#26a69a' : '#ef5350' }}>{result.stats.pnlPct >= 0 ? '+' : ''}{result.stats.pnlPct.toFixed(1)}%</b>)</span>
                <span>Max DD {result.stats.maxDrawdownPct.toFixed(1)}%</span>
              </div>
              <EquitySpark equity={result.equity} />
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function EquitySpark({ equity }: { equity: Array<{ balance: number }> }) {
  if (equity.length < 2) return null;
  const w = 320;
  const h = 60;
  const xs = equity.map((_, i) => (i / (equity.length - 1)) * w);
  const min = Math.min(...equity.map((e) => e.balance));
  const max = Math.max(...equity.map((e) => e.balance));
  const range = max - min || 1;
  const points = equity.map((e, i) => `${xs[i]},${h - ((e.balance - min) / range) * h}`).join(' ');
  const positive = equity[equity.length - 1].balance >= equity[0].balance;
  return (
    <svg width={w} height={h} style={{ marginTop: 8, background: '#161b22', borderRadius: 3 }}>
      <polyline fill="none" stroke={positive ? '#26a69a' : '#ef5350'} strokeWidth={1.5} points={points} />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#8b949e' }}>
      {label}
      {children}
    </label>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: 11,
  fontFamily: 'inherit',
  border: '1px solid #30363d',
  borderRadius: 3,
  background: '#0d1117',
  color: '#8b949e',
  cursor: 'pointer',
};
const activeBtnStyle: React.CSSProperties = { background: '#1f6feb', color: '#fff', borderColor: '#1f6feb' };
const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  marginTop: 4,
  right: 0,
  width: 360,
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  zIndex: 50,
  fontSize: 12,
};
const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 8px',
  background: '#161b22',
  borderBottom: '1px solid #30363d',
  fontSize: 11,
  color: '#c9d1d9',
};
const paramsStyle: React.CSSProperties = { display: 'flex', gap: 6, padding: 10, alignItems: 'flex-end' };
const inputStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '2px 4px',
  background: '#161b22',
  color: '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: 3,
  width: 50,
};
const runBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'inherit',
  background: '#1f6feb',
  color: '#fff',
  border: '1px solid #1f6feb',
  borderRadius: 3,
  cursor: 'pointer',
};
const resultStyle: React.CSSProperties = { padding: 10, color: '#c9d1d9', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 };
const statRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 };
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#8b949e',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: '0 4px',
};
