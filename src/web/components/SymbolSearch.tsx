import { useEffect, useMemo, useState } from 'react';

interface SymbolSearchProps {
  open: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
}

/**
 * Built-in ticker library (extend freely). Anything you type that doesn't
 * match a preset is still accepted on Enter — the SymbolManager will route
 * it via its own pattern rules (3-letter caps → TCBS, 6-letter → FX, etc).
 */
const ALL_TICKERS: string[] = [
  // Crypto
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'MATICUSDT', 'TRXUSDT',
  'PAXGUSDT', 'XAUTUSDT',
  // Forex / metals
  'XAUUSD', 'XAGUSD',
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
  'EURJPY', 'GBPJPY', 'EURGBP',
  // VN equities
  'HPG', 'VCB', 'FPT', 'MWG', 'VHM', 'VNM', 'VIC', 'MSN', 'TCB', 'ACB',
  'BID', 'CTG', 'GAS', 'HDB', 'PLX', 'SAB', 'SSI', 'STB', 'VJC', 'VRE',
  // VN futures
  'VN30F1M', 'VN30F2M',
];

export function SymbolSearch({ open, onClose, onPick }: SymbolSearchProps) {
  const [q, setQ] = useState('');
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (open) {
      setQ('');
      setHighlight(0);
    }
  }, [open]);

  const matches = useMemo(() => {
    const term = q.trim().toUpperCase();
    if (!term) return ALL_TICKERS.slice(0, 20);
    return ALL_TICKERS.filter((t) => t.includes(term)).slice(0, 30);
  }, [q]);

  if (!open) return null;

  const submit = (sym?: string) => {
    const choice = sym ?? matches[highlight] ?? q.trim().toUpperCase();
    if (choice) {
      onPick(choice);
      onClose();
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          autoFocus
          placeholder="Type any ticker — BTC, EUR, HPG, VN30F1M…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              setHighlight((h) => Math.min(matches.length - 1, h + 1));
              e.preventDefault();
            } else if (e.key === 'ArrowUp') {
              setHighlight((h) => Math.max(0, h - 1));
              e.preventDefault();
            } else if (e.key === 'Enter') {
              submit();
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          style={inputStyle}
        />
        <ul style={listStyle}>
          {matches.length === 0 ? (
            <li style={emptyStyle}>
              No preset match. Press <kbd style={kbdStyle}>Enter</kbd> to use <code>{q.trim().toUpperCase()}</code> anyway —
              the server will route by pattern (crypto / FX / VN equity).
            </li>
          ) : (
            matches.map((t, i) => (
              <li
                key={t}
                onClick={() => submit(t)}
                onMouseEnter={() => setHighlight(i)}
                style={{ ...itemStyle, ...(i === highlight ? itemActiveStyle : {}) }}
              >
                {t}
              </li>
            ))
          )}
        </ul>
        <div style={footerStyle}>
          ↑↓ navigate · ↵ select · Esc close
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh',
};
const panelStyle: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
  width: 'min(420px, 92vw)', boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const inputStyle: React.CSSProperties = {
  background: '#161b22', color: '#c9d1d9', border: 'none', borderBottom: '1px solid #30363d',
  fontSize: 14, fontFamily: 'inherit', padding: '12px 14px', outline: 'none',
};
const listStyle: React.CSSProperties = {
  margin: 0, padding: 0, listStyle: 'none', maxHeight: 320, overflowY: 'auto',
};
const itemStyle: React.CSSProperties = {
  padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#c9d1d9', fontFamily: 'inherit',
};
const itemActiveStyle: React.CSSProperties = { background: '#1f6feb', color: '#fff' };
const emptyStyle: React.CSSProperties = {
  padding: '12px 14px', color: '#8b949e', fontSize: 12, lineHeight: 1.5,
};
const footerStyle: React.CSSProperties = {
  padding: '8px 14px', borderTop: '1px solid #161b22', fontSize: 11, color: '#8b949e',
};
const kbdStyle: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 3, padding: '0 4px', fontFamily: 'inherit', fontSize: 10,
};
