import { useState } from 'react';
import type { Alert } from '../../shared/types.js';

interface AlertPanelProps {
  alerts: Alert[];
  onClear: () => void;
}

/**
 * Floating-corner alert panel. Collapsed: shows a small badge with the
 * unread count. Expanded: shows the last ~20 alerts in reverse chrono.
 */
export function AlertPanel({ alerts, onClear }: AlertPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const recent = alerts.slice(-20).reverse();
  const count = alerts.length;

  return (
    <div style={panelStyle}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{ ...headerBtnStyle, background: count > 0 ? '#1f6feb' : '#161b22' }}
      >
        🔔 Alerts {count > 0 && `(${count})`} {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div style={listStyle}>
          {recent.length === 0 ? (
            <div style={emptyStyle}>No alerts yet. Configure ALERT_SYMBOLS in .env or just open a chart and wait for the wave to fire.</div>
          ) : (
            recent.map((a) => <AlertRow key={a.id} alert={a} />)
          )}
          {recent.length > 0 && (
            <button type="button" onClick={onClear} style={clearBtnStyle}>Clear local history</button>
          )}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const t = new Date(alert.time * 1000).toISOString().slice(11, 16);
  const arrow = alert.direction === 'bull' ? '🟢' : '🔴';
  return (
    <div style={rowStyle}>
      <span style={{ marginRight: 6 }}>{arrow}</span>
      <span style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#c9d1d9' }}>{alert.headline}</div>
        <div style={{ fontSize: 10, color: '#8b949e' }}>
          {t} · {alert.rule} · {alert.price}
        </div>
      </span>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  width: 320,
  zIndex: 100,
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

const listStyle: React.CSSProperties = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  padding: 8,
  maxHeight: '60vh',
  overflowY: 'auto',
  pointerEvents: 'auto',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  padding: '6px 4px',
  borderBottom: '1px solid #161b22',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#8b949e',
  padding: 12,
  lineHeight: 1.5,
};

const clearBtnStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '4px 8px',
  fontSize: 11,
  fontFamily: 'inherit',
  background: 'transparent',
  border: '1px solid #30363d',
  borderRadius: 3,
  color: '#8b949e',
  cursor: 'pointer',
  width: '100%',
};
