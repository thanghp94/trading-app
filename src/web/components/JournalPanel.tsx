import { useState } from 'react';
import { useJournal, type TradeOutcome, type TradeRow } from '../use-journal.js';

/**
 * Trade journal panel — bottom-left, mirror of the alert panel.
 * Shows recent trades, stats summary, and inline edit for outcome/SL/TP/exit.
 */
export function JournalPanel() {
  const { trades, stats, update } = useJournal();
  const [expanded, setExpanded] = useState(false);

  const winRate = stats.wins + stats.losses > 0 ? (stats.wins / (stats.wins + stats.losses)) * 100 : 0;

  return (
    <div style={panelWrapStyle}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{ ...headerBtnStyle, background: stats.open > 0 ? '#d4a72c' : '#161b22' }}
      >
        📓 Journal {stats.total > 0 && `(${stats.total})`} {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div style={listStyle}>
          <div style={statsRowStyle}>
            <span><b>{stats.wins}</b>W · <b>{stats.losses}</b>L · {stats.breakeven}BE · {stats.open}open</span>
            <span>win {winRate.toFixed(0)}% · avg {stats.avgR.toFixed(2)}R</span>
            <a
              href="/api/journal/csv"
              style={{ fontSize: 10, color: '#1f6feb', textDecoration: 'none' }}
              title="Download all trades as CSV"
            >
              ⬇ CSV
            </a>
          </div>
          {trades.length === 0 ? (
            <div style={emptyStyle}>No trades yet. Auto-logged when an alert fires.</div>
          ) : (
            trades.slice(0, 30).map((t) => <TradeRowView key={t.id} trade={t} onUpdate={update} />)
          )}
        </div>
      )}
    </div>
  );
}

function TradeRowView({
  trade,
  onUpdate,
}: {
  trade: TradeRow;
  onUpdate: (id: string, patch: Partial<Pick<TradeRow, 'sl' | 'tp' | 'exit_price' | 'outcome' | 'notes'>>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const t = new Date(trade.opened_at * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const arrow = trade.direction === 'bull' ? '🟢' : '🔴';
  const outcomeColor: Record<TradeOutcome, string> = {
    open: '#d4a72c',
    win: '#26a69a',
    loss: '#ef5350',
    breakeven: '#8b949e',
    cancelled: '#6e7681',
  };

  return (
    <div style={tradeRowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#c9d1d9' }}>
            {arrow} {trade.symbol} {trade.timeframe} · entry {trade.entry_price}
            {trade.r_multiple != null && (
              <span style={{ marginLeft: 6, color: trade.r_multiple >= 0 ? '#26a69a' : '#ef5350' }}>
                {trade.r_multiple >= 0 ? '+' : ''}{trade.r_multiple.toFixed(2)}R
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#8b949e' }}>
            {t} · {trade.rule ?? 'manual'} ·{' '}
            <span style={{ color: outcomeColor[trade.outcome] }}>{trade.outcome}</span>
          </div>
        </div>
        <button type="button" onClick={() => setEditing((e) => !e)} style={editBtnStyle}>
          {editing ? '✕' : '✎'}
        </button>
      </div>
      {editing && <TradeEditor trade={trade} onSave={(patch) => onUpdate(trade.id, patch).then(() => setEditing(false))} />}
    </div>
  );
}

function TradeEditor({
  trade,
  onSave,
}: {
  trade: TradeRow;
  onSave: (patch: Partial<Pick<TradeRow, 'sl' | 'tp' | 'exit_price' | 'outcome' | 'notes'>>) => void;
}) {
  const [sl, setSl] = useState(trade.sl?.toString() ?? '');
  const [tp, setTp] = useState(trade.tp?.toString() ?? '');
  const [exit, setExit] = useState(trade.exit_price?.toString() ?? '');
  const [outcome, setOutcome] = useState<TradeOutcome>(trade.outcome);
  const [notes, setNotes] = useState(trade.notes ?? '');

  const save = () => {
    onSave({
      sl: sl ? Number(sl) : null,
      tp: tp ? Number(tp) : null,
      exit_price: exit ? Number(exit) : null,
      outcome,
      notes: notes || null,
    });
  };

  return (
    <div style={editorStyle}>
      <div style={editRowStyle}>
        <label>SL <input type="number" step="any" value={sl} onChange={(e) => setSl(e.target.value)} style={inputStyle} /></label>
        <label>TP <input type="number" step="any" value={tp} onChange={(e) => setTp(e.target.value)} style={inputStyle} /></label>
        <label>Exit <input type="number" step="any" value={exit} onChange={(e) => setExit(e.target.value)} style={inputStyle} /></label>
      </div>
      <div style={editRowStyle}>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as TradeOutcome)} style={inputStyle}>
          <option value="open">open</option>
          <option value="win">win</option>
          <option value="loss">loss</option>
          <option value="breakeven">breakeven</option>
          <option value="cancelled">cancelled</option>
        </select>
        <input type="text" placeholder="notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <button type="button" onClick={save} style={saveBtnStyle}>Save</button>
      </div>
    </div>
  );
}

const panelWrapStyle: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  bottom: 12,
  width: 380,
  zIndex: 100,
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

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 11,
  color: '#c9d1d9',
  padding: '4px 4px 8px',
  borderBottom: '1px solid #161b22',
  marginBottom: 6,
};

const tradeRowStyle: React.CSSProperties = {
  padding: '6px 4px',
  borderBottom: '1px solid #161b22',
};

const editBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#8b949e',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  padding: '0 4px',
};

const editorStyle: React.CSSProperties = {
  marginTop: 6,
  padding: 6,
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 3,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const editRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  fontSize: 11,
  color: '#c9d1d9',
};

const inputStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'inherit',
  background: '#161b22',
  color: '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: 3,
  padding: '2px 4px',
  width: 70,
};

const saveBtnStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: 11,
  fontFamily: 'inherit',
  background: '#1f6feb',
  color: '#fff',
  border: '1px solid #1f6feb',
  borderRadius: 3,
  cursor: 'pointer',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#8b949e',
  padding: 12,
};
