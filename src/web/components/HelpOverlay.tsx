interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ key: string; what: string }> = [
  { key: 'j / k', what: 'Cycle to next / previous chart cell (active = blue border)' },
  { key: '1 – 6', what: 'Set active cell timeframe to 1m / 5m / 15m / 1h / 4h / 1d' },
  { key: 'S', what: 'Open symbol search on active cell — type to filter, ↑↓ to pick' },
  { key: 'R', what: 'Toggle replay mode on active cell' },
  { key: 'Shift + 1 .. 9', what: 'Apply saved layout preset N' },
  { key: '?', what: 'Show / hide this help' },
];

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  if (!open) return null;
  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span>Keyboard shortcuts</span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>×</button>
        </div>
        <table style={tableStyle}>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.key}>
                <td style={keyCellStyle}><kbd style={kbdStyle}>{s.key}</kbd></td>
                <td style={whatCellStyle}>{s.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={footerStyle}>
          Tap <kbd style={kbdStyle}>?</kbd> any time to reopen. Shortcuts are blocked while you're typing in an input.
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panelStyle: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
  padding: 18, width: 'min(560px, 92vw)', boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
  fontSize: 13, color: '#c9d1d9',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderBottom: '1px solid #30363d', paddingBottom: 8, marginBottom: 12, fontSize: 14, fontWeight: 600,
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const keyCellStyle: React.CSSProperties = { padding: '6px 12px 6px 0', verticalAlign: 'top', whiteSpace: 'nowrap' };
const whatCellStyle: React.CSSProperties = { padding: '6px 0', color: '#8b949e' };
const kbdStyle: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 3,
  padding: '2px 6px', fontFamily: 'inherit', fontSize: 11, color: '#c9d1d9',
};
const footerStyle: React.CSSProperties = {
  marginTop: 12, paddingTop: 10, borderTop: '1px solid #161b22', fontSize: 11, color: '#8b949e',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent', color: '#8b949e', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px',
};
