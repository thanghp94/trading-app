import { useState } from 'react';
import type { Timeframe } from '../../shared/types.js';

interface BacktestResult {
  symbol: string;
  timeframe: string;
  trades: Array<{
    entry: number;
    exit: number;
    sl: number;
    tp: number;
    rMultiple: number;
    outcome: string;
    pnlAbs: number;
    balanceAfter: number;
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
  };
}

const VN_TIMEFRAMES: Timeframe[] = ['1d', '1h', '15m', '5m'];
const POPULAR_SYMBOLS = ['VN30F1M', 'HPG', 'VCB', 'FPT', 'VHM', 'MWG', 'TCB', 'VIC', 'MSN', 'ACB'];

export function VnBacktestPanel() {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('VN30F1M');
  const [customSymbol, setCustomSymbol] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slMode, setSlMode] = useState<'pct' | 'trigger-wick'>('trigger-wick');
  const [tpMode, setTpMode] = useState<'rr' | 'next-resistance'>('next-resistance');
  const [slPct, setSlPct] = useState('0.5');
  const [rrTarget, setRrTarget] = useState('2');
  const [maxBars, setMaxBars] = useState('30');
  const [riskPct, setRiskPct] = useState('1');
  const [startingBalance, setStartingBalance] = useState('10000');
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [mtfTrendAlign, setMtfTrendAlign] = useState(false);
  const [mtfZoneConfluence, setMtfZoneConfluence] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'trades'>('stats');

  const effectiveSymbol = customSymbol.trim().toUpperCase() || symbol;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/backtest/vn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: effectiveSymbol,
          timeframe,
          fromDate,
          toDate,
          slMode,
          slPct: Number(slPct) / 100,
          tpMode,
          rrTarget: Number(rrTarget),
          maxBars: Number(maxBars),
          riskPct: Number(riskPct),
          startingBalance: Number(startingBalance),
          preferredOnly,
          mtfTrendAlign,
          mtfZoneConfluence,
        }),
      });
      const json = await res.json() as BacktestResult & { error?: string };
      if (json.error) { setError(json.error); return; }
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrapStyle}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...headerBtnStyle, ...(open ? activeBtnStyle : {}) }}>
        🇻🇳 VN Backtest {open ? '▾' : '▸'}
      </button>
      {open && (
        <div style={panelStyle}>
          {/* Symbol + Timeframe */}
          <div style={sectionStyle}>
            <div style={rowStyle}>
              <Field label="Symbol">
                <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={selectStyle}>
                  {POPULAR_SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Custom symbol">
                <input
                  type="text"
                  placeholder="e.g. ACB"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                  style={{ ...inputStyle, width: 70 }}
                />
              </Field>
              <Field label="Timeframe">
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)} style={selectStyle}>
                  {VN_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </Field>
            </div>
            {/* Date range */}
            <div style={rowStyle}>
              <Field label="From">
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="To">
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Balance $">
                <input type="number" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} style={{ ...inputStyle, width: 70 }} />
              </Field>
            </div>
          </div>

          {/* SL / TP / params */}
          <div style={{ ...sectionStyle, borderTop: '1px solid #21262d' }}>
            <div style={rowStyle}>
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
              <Field label={slMode === 'pct' ? 'SL %' : 'SL % (fallback)'}>
                <input type="number" step="any" value={slPct} onChange={(e) => setSlPct(e.target.value)} style={inputStyle} />
              </Field>
              <Field label={tpMode === 'rr' ? 'R:R' : 'R:R fallback'}>
                <input type="number" step="any" value={rrTarget} onChange={(e) => setRrTarget(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Max bars">
                <input type="number" value={maxBars} onChange={(e) => setMaxBars(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Risk %">
                <input type="number" step="any" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div style={{ ...rowStyle, gap: 12 }}>
              <CheckField label="Preferred only (★ wave-5)" checked={preferredOnly} onChange={setPreferredOnly} />
              <CheckField label="MTF trend align" checked={mtfTrendAlign} onChange={setMtfTrendAlign} />
              <CheckField label="HTF zone confluence" checked={mtfZoneConfluence} onChange={setMtfZoneConfluence} />
              <button type="button" onClick={run} disabled={busy} style={runBtnStyle}>
                {busy ? 'Fetching DNSE data…' : `▶ Run ${effectiveSymbol} ${timeframe}`}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && <div style={errorStyle}>{error}</div>}

          {/* Results */}
          {result && (
            <div style={{ ...sectionStyle, borderTop: '1px solid #21262d' }}>
              {/* Summary stats */}
              <div style={statGridStyle}>
                <Stat label="Trades" value={String(result.stats.total)} />
                <Stat label="Win rate" value={`${(result.stats.winRate * 100).toFixed(1)}%`} color={result.stats.winRate >= 0.5 ? '#26a69a' : '#ef5350'} />
                <Stat label="Avg R" value={result.stats.avgR.toFixed(2)} color={result.stats.avgR >= 0 ? '#26a69a' : '#ef5350'} />
                <Stat label="Sum R" value={result.stats.sumR.toFixed(1)} color={result.stats.sumR >= 0 ? '#26a69a' : '#ef5350'} />
                <Stat label="Best R" value={result.stats.bestR.toFixed(2)} color="#26a69a" />
                <Stat label="Worst R" value={result.stats.worstR.toFixed(2)} color="#ef5350" />
                <Stat label="Max DD" value={`${result.stats.maxDrawdownPct.toFixed(1)}%`} color="#ef5350" />
                <Stat label="PnL" value={`${result.stats.pnlPct >= 0 ? '+' : ''}${result.stats.pnlPct.toFixed(1)}%`} color={result.stats.pnlPct >= 0 ? '#26a69a' : '#ef5350'} />
              </div>
              <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>
                {result.stats.wins}W · {result.stats.losses}L · {result.stats.breakeven}BE · {result.stats.timeStops}TS
                &nbsp;· Final ${result.stats.finalBalance.toFixed(0)}
              </div>

              <EquitySpark equity={result.equity} />

              {/* Tab: trades */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {(['stats', 'trades'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setActiveTab(t)}
                    style={{ ...tabBtnStyle, ...(activeTab === t ? activeTabStyle : {}) }}>
                    {t === 'stats' ? 'Summary' : `Trades (${result.trades.length})`}
                  </button>
                ))}
              </div>
              {activeTab === 'trades' && (
                <div style={tradeListStyle}>
                  <div style={tradeHeaderStyle}>
                    <span>#</span><span>Entry</span><span>Exit</span><span>Outcome</span><span>R</span><span>Balance</span>
                  </div>
                  {result.trades.map((t, i) => (
                    <div key={i} style={{ ...tradeRowStyle, background: i % 2 === 0 ? '#0d1117' : '#161b22' }}>
                      <span style={{ color: '#8b949e' }}>{i + 1}</span>
                      <span>{fmt(t.entry)}</span>
                      <span>{fmt(t.exit)}</span>
                      <span style={{ color: outcomeColor(t.outcome) }}>{t.outcome}</span>
                      <span style={{ color: t.rMultiple >= 0 ? '#26a69a' : '#ef5350' }}>{t.rMultiple.toFixed(2)}</span>
                      <span style={{ color: '#8b949e' }}>${t.balanceAfter.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString('vi-VN') : n.toFixed(2);
}

function outcomeColor(o: string) {
  if (o === 'win') return '#26a69a';
  if (o === 'loss') return '#ef5350';
  return '#8b949e';
}

function EquitySpark({ equity }: { equity: Array<{ balance: number }> }) {
  if (equity.length < 2) return null;
  const w = 500; const h = 70;
  const xs = equity.map((_, i) => (i / (equity.length - 1)) * w);
  const min = Math.min(...equity.map((e) => e.balance));
  const max = Math.max(...equity.map((e) => e.balance));
  const range = max - min || 1;
  const points = equity.map((e, i) => `${xs[i]},${h - ((e.balance - min) / range) * (h - 4) - 2}`).join(' ');
  const positive = equity[equity.length - 1].balance >= equity[0].balance;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ marginTop: 6, background: '#161b22', borderRadius: 3, display: 'block' }}>
      <polyline fill="none" stroke={positive ? '#26a69a' : '#ef5350'} strokeWidth={1.5} points={points} />
    </svg>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: 9, color: '#8b949e', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? '#c9d1d9' }}>{value}</span>
    </div>
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

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b949e', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const wrapStyle: React.CSSProperties = { position: 'relative' };

const headerBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'inherit',
  background: '#161b22',
  color: '#8b949e',
  border: '1px solid #30363d',
  borderRadius: 3,
  cursor: 'pointer',
};
const activeBtnStyle: React.CSSProperties = { background: '#1f2937', color: '#c9d1d9', borderColor: '#388bfd' };

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  marginBottom: 4,
  width: 580,
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  boxShadow: '0 -4px 16px rgba(0,0,0,0.5)',
  zIndex: 60,
  fontSize: 11,
  color: '#c9d1d9',
};

const sectionStyle: React.CSSProperties = { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 };
const rowStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' };

const selectStyle: React.CSSProperties = {
  fontSize: 11, fontFamily: 'inherit', padding: '3px 4px',
  background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 3,
};
const inputStyle: React.CSSProperties = {
  fontSize: 11, fontFamily: 'inherit', padding: '3px 4px',
  background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 3, width: 60,
};

const runBtnStyle: React.CSSProperties = {
  padding: '4px 12px', fontSize: 11, fontFamily: 'inherit',
  background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', marginLeft: 'auto',
};

const errorStyle: React.CSSProperties = {
  margin: '0 12px 8px', padding: '6px 8px', background: '#2d1b1b',
  border: '1px solid #f8514926', borderRadius: 3, color: '#ef5350', fontSize: 11,
};

const statGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4,
  background: '#161b22', borderRadius: 3, padding: '8px 4px',
};

const tabBtnStyle: React.CSSProperties = {
  padding: '2px 8px', fontSize: 10, fontFamily: 'inherit',
  background: '#161b22', color: '#8b949e', border: '1px solid #30363d', borderRadius: 3, cursor: 'pointer',
};
const activeTabStyle: React.CSSProperties = { color: '#c9d1d9', borderColor: '#388bfd', background: '#1f2937' };

const tradeListStyle: React.CSSProperties = {
  maxHeight: 200, overflowY: 'auto', fontSize: 10, borderRadius: 3,
  border: '1px solid #21262d', marginTop: 4,
};
const tradeHeaderStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '24px 1fr 1fr 70px 40px 70px',
  gap: 4, padding: '4px 8px', background: '#161b22', color: '#8b949e',
  position: 'sticky', top: 0,
};
const tradeRowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '24px 1fr 1fr 70px 40px 70px',
  gap: 4, padding: '3px 8px',
};
