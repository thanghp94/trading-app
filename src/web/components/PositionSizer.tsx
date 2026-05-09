import { useState, useEffect } from 'react';

const STORAGE_KEY = 'trading-app:position-sizer-v1';

interface SizerState {
  balance: string;
  riskPct: string;
  entry: string;
  stopLoss: string;
}

const DEFAULT: SizerState = { balance: '10000', riskPct: '1', entry: '', stopLoss: '' };

/**
 * Floating position sizer. Risk-% in, lot size out. Persists last input
 * to localStorage so you don't retype balance every time.
 *
 *   risk_amount    = balance × (risk% / 100)
 *   risk_per_unit  = |entry - SL|
 *   lot_size       = risk_amount / risk_per_unit
 *   reward_per_R   = lot_size × risk_per_unit  (= risk_amount, by definition)
 *
 * Independent of any specific trade in the journal — it's a quick calculator.
 */
export function PositionSizer() {
  const [expanded, setExpanded] = useState(false);
  const [s, setS] = useState<SizerState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<SizerState>) };
    } catch {
      /* ignore */
    }
    return DEFAULT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* ignore quota */
    }
  }, [s]);

  const balance = parseFloat(s.balance);
  const riskPct = parseFloat(s.riskPct);
  const entry = parseFloat(s.entry);
  const sl = parseFloat(s.stopLoss);
  const haveAll = [balance, riskPct, entry, sl].every(Number.isFinite);
  const riskAmount = haveAll ? balance * (riskPct / 100) : 0;
  const riskPerUnit = haveAll ? Math.abs(entry - sl) : 0;
  const lotSize = haveAll && riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{ ...headerBtnStyle, background: '#161b22' }}
        title="Position sizer"
      >
        🧮 Sizer {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div style={panelStyle}>
          <Row label="Balance ($)">
            <input type="number" step="any" value={s.balance} onChange={(e) => setS({ ...s, balance: e.target.value })} style={inputStyle} />
          </Row>
          <Row label="Risk %">
            <input type="number" step="any" value={s.riskPct} onChange={(e) => setS({ ...s, riskPct: e.target.value })} style={inputStyle} />
          </Row>
          <Row label="Entry">
            <input type="number" step="any" placeholder="2 305.50" value={s.entry} onChange={(e) => setS({ ...s, entry: e.target.value })} style={inputStyle} />
          </Row>
          <Row label="Stop loss">
            <input type="number" step="any" placeholder="2 295.00" value={s.stopLoss} onChange={(e) => setS({ ...s, stopLoss: e.target.value })} style={inputStyle} />
          </Row>
          <div style={resultStyle}>
            {haveAll && riskPerUnit > 0 ? (
              <>
                <div>Risk: <b>${riskAmount.toFixed(2)}</b></div>
                <div>Per unit: <b>{riskPerUnit.toFixed(4)}</b></div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  Lot size: <b style={{ color: '#26a69a' }}>{lotSize.toFixed(4)}</b>
                </div>
              </>
            ) : (
              <div style={{ color: '#8b949e', fontSize: 11 }}>Fill all four to compute lot size.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={rowStyle}>
      <span style={{ color: '#8b949e', minWidth: 80 }}>{label}</span>
      {children}
    </label>
  );
}

const wrapStyle: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  top: 12,
  zIndex: 99,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  pointerEvents: 'none',
};
const headerBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '6px 12px',
  fontSize: 12,
  fontFamily: 'inherit',
  border: '1px solid #30363d',
  borderRadius: 4,
  color: '#c9d1d9',
  cursor: 'pointer',
  pointerEvents: 'auto',
};
const panelStyle: React.CSSProperties = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  padding: 10,
  width: 240,
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  pointerEvents: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: '#c9d1d9',
};
const inputStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 11,
  fontFamily: 'inherit',
  background: '#161b22',
  color: '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: 3,
  padding: '3px 6px',
};
const resultStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '6px 8px',
  background: '#161b22',
  borderRadius: 3,
  fontSize: 11,
  color: '#c9d1d9',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
