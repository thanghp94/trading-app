import { useState } from 'react';
import type { NamedLayout } from '../use-layout.js';

interface LayoutControlsProps {
  cols: number;
  cellCount: number;
  saved: NamedLayout[];
  onCols: (cols: number) => void;
  onAddChart: () => void;
  onReset: () => void;
  onSaveCurrent: (name: string) => void;
  onApplySaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
}

const COL_OPTIONS = [1, 2, 3, 4, 5, 6];

export function LayoutControls(p: LayoutControlsProps) {
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const submitSave = () => {
    if (!savingName.trim()) return;
    p.onSaveCurrent(savingName.trim());
    setSavingName('');
    setShowSaveInput(false);
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={labelStyle}>cols</span>
      <div style={{ display: 'flex', gap: 2 }}>
        {COL_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => p.onCols(n)}
            style={{ ...btnStyle, ...(p.cols === n ? activeStyle : {}) }}
          >
            {n}
          </button>
        ))}
      </div>
      <span style={dividerStyle} />
      <button type="button" onClick={p.onAddChart} style={btnStyle}>+ Chart</button>
      <button type="button" onClick={p.onReset} style={{ ...btnStyle, opacity: 0.7 }}>Reset</button>
      <span style={dividerStyle} />
      {p.saved.length > 0 && (
        <select
          onChange={(e) => {
            if (e.target.value) p.onApplySaved(e.target.value);
            e.target.value = '';
          }}
          defaultValue=""
          style={selectStyle}
          title="Apply a saved layout"
        >
          <option value="" disabled>Apply preset…</option>
          {p.saved.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.config.cells.length} charts)
            </option>
          ))}
        </select>
      )}
      {showSaveInput ? (
        <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Preset name"
            value={savingName}
            onChange={(e) => setSavingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSave();
              if (e.key === 'Escape') setShowSaveInput(false);
            }}
            autoFocus
            style={inputStyle}
          />
          <button type="button" onClick={submitSave} style={{ ...btnStyle, background: '#1f6feb', color: '#fff' }}>Save</button>
          <button type="button" onClick={() => setShowSaveInput(false)} style={btnStyle}>✕</button>
        </span>
      ) : (
        <button type="button" onClick={() => setShowSaveInput(true)} style={btnStyle}>💾 Save…</button>
      )}
      {p.saved.length > 0 && (
        <select
          onChange={(e) => {
            if (e.target.value) p.onDeleteSaved(e.target.value);
            e.target.value = '';
          }}
          defaultValue=""
          style={{ ...selectStyle, opacity: 0.6 }}
          title="Delete a saved layout"
        >
          <option value="" disabled>Delete…</option>
          {p.saved.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <span style={{ ...labelStyle, marginLeft: 4 }}>
        {p.cellCount} chart{p.cellCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: '#8b949e' };
const dividerStyle: React.CSSProperties = { width: 1, height: 18, background: '#30363d', margin: '0 4px' };
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
const activeStyle: React.CSSProperties = { background: '#1f6feb', color: '#fff', borderColor: '#1f6feb' };
const selectStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '4px 6px',
  background: '#161b22',
  color: '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: 4,
  cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '4px 6px',
  background: '#0d1117',
  color: '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: 3,
  width: 120,
};
