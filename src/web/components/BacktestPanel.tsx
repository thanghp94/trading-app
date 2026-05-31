import { useEffect, useRef, useState } from 'react';
import type { Candle, Timeframe } from '../../shared/types.js';
import { MiniBacktestChart, type MiniTrade } from './MiniBacktestChart.js';

interface BacktestPanelProps {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
}

interface BacktestResult {
  trades: Array<{
    entryIdx: number;
    exitIdx: number;
    entry: number;
    exit: number;
    sl: number;
    tp: number;
    rMultiple: number;
    outcome: 'win' | 'loss' | 'breakeven' | 'time-stop';
    pnlAbs: number;
    balanceAfter: number;
    feesPaid: number;
  }>;
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
    totalFees: number;
    skippedNoCapital: number;
    perRule: Array<{ rule: string; total: number; winRate: number; avgR: number; sumR: number }>;
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
  const [slMode, setSlMode] = useState<'pct' | 'trigger-wick'>('trigger-wick');
  const [tpMode, setTpMode] = useState<'rr' | 'next-resistance'>('next-resistance');
  const [slPct, setSlPct] = useState('0.5');
  const [rrTarget, setRrTarget] = useState('2');
  const [maxBars, setMaxBars] = useState('30');
  const [riskPct, setRiskPct] = useState('1');
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [mtfTrendAlign, setMtfTrendAlign] = useState(false);
  const [mtfZoneConfluence, setMtfZoneConfluence] = useState(false);
  // Realism pack (defaults all 0 — generic, no auto-VN here since this
  // per-chart panel works for crypto/forex too)
  const [feeBps, setFeeBps] = useState('0');
  const [sellTaxBps, setSellTaxBps] = useState('0');
  const [lotSize, setLotSize] = useState('1');
  const [settlementBars, setSettlementBars] = useState('0');
  const [vnSessionFilter, setVnSessionFilter] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [showChart, setShowChart] = useState(true);

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
          slMode,
          slPct: Number(slPct) / 100,
          slBufferAtr: 0.1,
          tpMode,
          rrTarget: Number(rrTarget),
          tpBufferAtr: 0.1,
          maxBars: Number(maxBars),
          riskPct: Number(riskPct),
          startingBalance: 10_000,
          preferredOnly,
          mtfTrendAlign,
          mtfZoneConfluence,
          feeBps: Number(feeBps),
          sellTaxBps: Number(sellTaxBps),
          lotSize: Number(lotSize),
          settlementBars: Number(settlementBars),
          vnSessionFilter,
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
          <div style={modeRowStyle}>
            <Field label="SL mode">
              <select value={slMode} onChange={(e) => setSlMode(e.target.value as 'pct' | 'trigger-wick')} style={selectStyle}>
                <option value="trigger-wick">Trigger wick ★</option>
                <option value="pct">Pct of entry</option>
              </select>
            </Field>
            <Field label="TP mode">
              <select value={tpMode} onChange={(e) => setTpMode(e.target.value as 'rr' | 'next-resistance')} style={selectStyle}>
                <option value="next-resistance">Next resistance ★</option>
                <option value="rr">R:R fixed</option>
              </select>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer' }}>
              <input type="checkbox" checked={preferredOnly} onChange={(e) => setPreferredOnly(e.target.checked)} />
              Preferred only (★ wave-5)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer' }} title="HTF EMA(50) must agree with the trade direction">
              <input type="checkbox" checked={mtfTrendAlign} onChange={(e) => setMtfTrendAlign(e.target.checked)} />
              MTF trend align
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer' }} title="Entry must be inside an active HTF S/R zone in trade direction">
              <input type="checkbox" checked={mtfZoneConfluence} onChange={(e) => setMtfZoneConfluence(e.target.checked)} />
              HTF zone confluence
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer' }} title="Drops intraday alerts outside HOSE session (lunch break / closed hours)">
              <input type="checkbox" checked={vnSessionFilter} onChange={(e) => setVnSessionFilter(e.target.checked)} />
              VN session filter
            </label>
          </div>
          {/* Realism row */}
          <div style={{ ...modeRowStyle, paddingTop: 4, paddingBottom: 4, borderTop: '1px solid #21262d' }}>
            <Field label="Fee bps"><input type="number" value={feeBps} onChange={(e) => setFeeBps(e.target.value)} style={inputStyle} /></Field>
            <Field label="SellTax bps"><input type="number" value={sellTaxBps} onChange={(e) => setSellTaxBps(e.target.value)} style={inputStyle} /></Field>
            <Field label="Lot size"><input type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} style={inputStyle} /></Field>
            <Field label="T+ bars"><input type="number" value={settlementBars} onChange={(e) => setSettlementBars(e.target.value)} style={inputStyle} /></Field>
          </div>
          <div style={paramsStyle}>
            <Field label={slMode === 'pct' ? 'SL %' : 'SL % (fallback)'}>
              <input type="number" step="any" value={slPct} onChange={(e) => setSlPct(e.target.value)} style={inputStyle} />
            </Field>
            <Field label={tpMode === 'rr' ? 'R:R' : 'R:R (fallback)'}>
              <input type="number" step="any" value={rrTarget} onChange={(e) => setRrTarget(e.target.value)} style={inputStyle} />
            </Field>
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
                <span>Fees ${result.stats.totalFees.toFixed(0)}</span>
              </div>
              {result.stats.skippedNoCapital > 0 && (
                <div style={{ fontSize: 10, color: '#f0b132' }}>
                  ⚠ {result.stats.skippedNoCapital} trades skipped (lot-rounded shares = 0)
                </div>
              )}

              {result.stats.perRule.length > 0 && (
                <div style={{ borderTop: '1px solid #21262d', paddingTop: 4 }}>
                  <div style={{ fontSize: 9, color: '#8b949e', textTransform: 'uppercase', marginBottom: 2 }}>Per-rule</div>
                  {result.stats.perRule.map((r) => (
                    <div key={r.rule} style={{ display: 'grid', gridTemplateColumns: '1.2fr 30px 40px 40px 40px', gap: 6, fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
                      <span style={{ color: r.rule === 'wave-5-entry' ? '#f0b132' : '#c9d1d9' }}>{r.rule}</span>
                      <span>{r.total}</span>
                      <span style={{ color: r.winRate >= 0.5 ? '#26a69a' : '#ef5350' }}>{(r.winRate * 100).toFixed(0)}%</span>
                      <span style={{ color: r.avgR >= 0 ? '#26a69a' : '#ef5350' }}>{r.avgR.toFixed(2)}R</span>
                      <span style={{ color: r.sumR >= 0 ? '#26a69a' : '#ef5350' }}>{r.sumR.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, fontSize: 10, color: '#8b949e' }}>
                <label style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={showChart} onChange={(e) => setShowChart(e.target.checked)} /> Chart + replay
                </label>
              </div>
              {showChart ? (
                <PanelChartReplay candles={props.candles} trades={result.trades as MiniTrade[]} />
              ) : (
                <EquitySpark equity={result.equity} />
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/**
 * Per-chart-cell inline replay. Compact controls (the panel is narrow).
 * Mirrors the VN-panel version but scaled to ~340px wide.
 */
function PanelChartReplay({ candles, trades }: { candles: Candle[]; trades: MiniTrade[] }) {
  const [enabled, setEnabled] = useState(false);
  const [cursor, setCursor] = useState(() => Math.floor(candles.length * 0.7));
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    setCursor(Math.floor(candles.length * 0.7));
    setPlaying(false);
    setEnabled(false);
  }, [candles]);

  useEffect(() => {
    if (!playing || !enabled) {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setCursor((c) => {
        if (c >= candles.length) { setPlaying(false); return candles.length; }
        return c + 1;
      });
    }, 200);
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [playing, enabled, candles.length]);

  const step = (d: number) => setCursor((c) => Math.max(30, Math.min(candles.length, c + d)));
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0', fontSize: 10, color: '#8b949e' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setPlaying(false); }} />
          Replay
        </label>
        {enabled && (
          <>
            <button type="button" onClick={() => step(-10)} style={miniBtnStyle}>−10</button>
            <button type="button" onClick={() => step(-1)} style={miniBtnStyle}>−1</button>
            <button type="button" onClick={() => setPlaying((p) => !p)} style={{ ...miniBtnStyle, background: playing ? '#ef5350' : '#26a69a', color: '#fff', border: 'none' }}>
              {playing ? '⏸' : '▶'}
            </button>
            <button type="button" onClick={() => step(1)} style={miniBtnStyle}>+1</button>
            <button type="button" onClick={() => step(10)} style={miniBtnStyle}>+10</button>
            <span style={{ marginLeft: 'auto', fontFamily: 'ui-monospace, monospace' }}>{cursor}/{candles.length}</span>
          </>
        )}
      </div>
      <MiniBacktestChart candles={candles} trades={trades} height={220} cursor={enabled ? cursor : undefined} />
      {enabled && (
        <input type="range" min={30} max={candles.length} value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
          style={{ width: '100%', marginTop: 2 }} />
      )}
    </div>
  );
}

const miniBtnStyle: React.CSSProperties = {
  padding: '2px 5px', fontSize: 10, background: '#0d1117', color: '#c9d1d9',
  border: '1px solid #30363d', borderRadius: 3, cursor: 'pointer',
};

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
  width: 480,
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  zIndex: 50,
  fontSize: 12,
  maxHeight: '80vh',
  overflowY: 'auto',
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
const modeRowStyle: React.CSSProperties = {
  display: 'flex', gap: 8, padding: '8px 10px 0', alignItems: 'flex-end', flexWrap: 'wrap',
};
const paramsStyle: React.CSSProperties = { display: 'flex', gap: 6, padding: 10, alignItems: 'flex-end' };
const selectStyle: React.CSSProperties = {
  fontSize: 11, fontFamily: 'inherit', padding: '2px 4px',
  background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 3,
};
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
