import { useEffect, useState } from 'react';

interface ScannerEntry {
  symbol: string;
  timeframe: string;
  score: number;
  reasons: string[];
  lastClose: number;
  lastTime: number;
}

interface WatchlistPanelProps {
  onPick?: (symbol: string, timeframe: string) => void;
}

/**
 * Watchlist scanner — polls /api/scan every 30s, ranks all currently-active
 * server streams by setup quality, surfaces "best setups right now."
 *
 * The server only knows about streams it's actively subscribed to (from
 * ALERT_SYMBOLS or any symbol you've opened in the UI). To scan more
 * symbols, list them in ALERT_SYMBOLS or open them as cells.
 */
export function WatchlistPanel({ onPick }: WatchlistPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<ScannerEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/scan');
      const json = (await res.json()) as ScannerEntry[];
      setEntries(json);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{ ...headerBtnStyle, background: entries.length > 0 ? '#26a69a' : '#161b22' }}
      >
        🎯 Watchlist {entries.length > 0 && `(${entries.length})`} {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div style={panelStyle}>
          <div style={headerRowStyle}>
            <span style={{ color: '#8b949e' }}>Top setups · ranked by score</span>
            <button type="button" onClick={refresh} style={refreshBtnStyle}>
              {busy ? '↻' : 'refresh'}
            </button>
          </div>
          {entries.length === 0 ? (
            <div style={emptyStyle}>
              No setups detected. Add symbols to <code>ALERT_SYMBOLS</code> in <code>.env</code> or open more cells in the grid so the server can monitor them.
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={`${e.symbol}-${e.timeframe}`}
                style={rowStyle}
                onClick={() => onPick?.(e.symbol, e.timeframe)}
                title={onPick ? 'Click to swap into the first chart cell' : undefined}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: '#c9d1d9' }}>
                    <b>{e.symbol}</b> {e.timeframe} · {e.lastClose}
                  </span>
                  <span style={scoreStyle}>{e.score}</span>
                </div>
                <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', fontSize: 10, color: '#8b949e', listStyle: 'disc' }}>
                  {e.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  position: 'fixed',
  right: 12,
  top: 12,
  width: 340,
  zIndex: 99,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  pointerEvents: 'none',
};
const headerBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-end',
  padding: '6px 12px',
  fontSize: 12,
  fontFamily: 'inherit',
  border: '1px solid #30363d',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  pointerEvents: 'auto',
};
const panelStyle: React.CSSProperties = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  padding: 8,
  maxHeight: '70vh',
  overflowY: 'auto',
  pointerEvents: 'auto',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
};
const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 11,
  paddingBottom: 6,
  marginBottom: 6,
  borderBottom: '1px solid #161b22',
};
const refreshBtnStyle: React.CSSProperties = {
  fontSize: 10,
  background: 'transparent',
  border: '1px solid #30363d',
  borderRadius: 3,
  color: '#8b949e',
  padding: '2px 6px',
  cursor: 'pointer',
};
const rowStyle: React.CSSProperties = {
  padding: '6px 4px',
  borderBottom: '1px solid #161b22',
  cursor: 'pointer',
};
const scoreStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#26a69a',
};
const emptyStyle: React.CSSProperties = { fontSize: 11, color: '#8b949e', padding: 12, lineHeight: 1.5 };
