interface LayoutControlsProps {
  cols: number;
  cellCount: number;
  onCols: (cols: number) => void;
  onAddChart: () => void;
  onReset: () => void;
}

const COL_OPTIONS = [1, 2, 3, 4, 5, 6];

export function LayoutControls({ cols, cellCount, onCols, onAddChart, onReset }: LayoutControlsProps) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={labelStyle}>cols</span>
      <div style={{ display: 'flex', gap: 2 }}>
        {COL_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onCols(n)}
            style={{ ...btnStyle, ...(cols === n ? activeStyle : {}) }}
          >
            {n}
          </button>
        ))}
      </div>
      <span style={{ width: 1, height: 18, background: '#30363d', margin: '0 4px' }} />
      <button type="button" onClick={onAddChart} style={btnStyle}>+ Chart</button>
      <button type="button" onClick={onReset} style={{ ...btnStyle, opacity: 0.7 }} title="Reset to default 2×2 layout">
        Reset
      </button>
      <span style={{ ...labelStyle, marginLeft: 4 }}>
        {cellCount} chart{cellCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: '#8b949e' };

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  fontFamily: 'inherit',
  border: '1px solid #30363d',
  borderRadius: 4,
  background: '#161b22',
  color: '#c9d1d9',
  cursor: 'pointer',
  minWidth: 28,
};

const activeStyle: React.CSSProperties = {
  background: '#1f6feb',
  color: '#fff',
  borderColor: '#1f6feb',
};
