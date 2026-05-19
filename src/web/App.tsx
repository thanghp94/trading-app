import { useState } from 'react';
import { ChartCell } from './components/ChartCell.js';
import { LayoutControls } from './components/LayoutControls.js';
import { AlertPanel } from './components/AlertPanel.js';
import { JournalPanel } from './components/JournalPanel.js';
import { PositionSizer } from './components/PositionSizer.js';
import { WatchlistPanel } from './components/WatchlistPanel.js';
import { VnBacktestPanel } from './components/VnBacktestPanel.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { SymbolSearch } from './components/SymbolSearch.js';
import { MarketSessions } from './components/MarketSessions.js';
import { useTheme } from './use-theme.js';
import { useLayout } from './use-layout.js';
import { useAlerts } from './use-alerts.js';
import { useAlertNotifications } from './use-alert-notifications.js';
import { useShortcuts } from './use-shortcuts.js';
import { useDailyPnl } from './use-daily-pnl.js';
import type { Timeframe } from '../shared/types.js';

export function App() {
  const {
    layout, saved,
    updateCell, addCell, removeCell, setCols, reset,
    saveCurrent, applySaved, deleteSaved,
    openTriplet,
  } = useLayout();
  const { alerts, clearAlerts } = useAlerts();
  useAlertNotifications(alerts);
  const pnl = useDailyPnl();
  const [theme, setTheme] = useTheme();
  const [activeIdx, setActiveIdx] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);

  const activeCell = layout.cells[activeIdx];

  useShortcuts({
    nextCell: () => setActiveIdx((i) => (layout.cells.length === 0 ? 0 : (i + 1) % layout.cells.length)),
    prevCell: () => setActiveIdx((i) => (layout.cells.length === 0 ? 0 : (i - 1 + layout.cells.length) % layout.cells.length)),
    setActiveTimeframe: (tf: Timeframe) => activeCell && updateCell(activeCell.id, { timeframe: tf }),
    openSymbolSearch: () => setSymbolSearchOpen(true),
    toggleHelp: () => setHelpOpen((o) => !o),
    applyPresetByIndex: (idx) => {
      const target = saved[idx];
      if (target) applySaved(target.id);
    },
    toggleReplay: () => {
      // Replay toggle delegates to the cell — easiest path is to re-render
      // the active cell with a dispatched custom event. KISS: cell has own
      // state, so we just open help to remind user that R toggles per-cell
      // via the UI button. Keyboard alone can't reach cell-internal state
      // without lifting state up — deferred.
      // For now, no-op; user clicks the per-cell ⏯ button.
    },
  });

  const onWatchlistPick = (symbol: string, timeframe: string) => {
    const tf = timeframe as Timeframe;
    if (layout.cells.length > 0) updateCell(layout.cells[0].id, { symbol, timeframe: tf });
    else addCell();
  };

  const onSymbolSearchPick = (symbol: string) => {
    if (activeCell) updateCell(activeCell.id, { symbol });
    else {
      addCell();
      // Newly added cell becomes the last; updateCell on it next render — KISS skip for now
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 8, gap: 8 }}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Trading App</h1>
        <DailyPnlBadge pnl={pnl} />
        <MarketSessions />
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={themeBtnStyle}
          title="Toggle light / dark theme"
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
        <LayoutControls
          cols={layout.cols}
          cellCount={layout.cells.length}
          saved={saved}
          onCols={setCols}
          onAddChart={addCell}
          onReset={reset}
          onSaveCurrent={saveCurrent}
          onApplySaved={applySaved}
          onDeleteSaved={deleteSaved}
        />
        <button type="button" onClick={() => setHelpOpen(true)} style={helpBtnStyle} title="Keyboard shortcuts (?)">?</button>
      </header>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridAutoRows: '1fr',
          gap: 6,
        }}
      >
        {layout.cells.map((cell, i) => (
          <ChartCell
            key={cell.id}
            cell={cell}
            active={i === activeIdx}
            onChange={(patch) => updateCell(cell.id, patch)}
            onRemove={() => removeCell(cell.id)}
            onFocus={() => setActiveIdx(i)}
            onTriplet={openTriplet}
          />
        ))}
        {layout.cells.length === 0 && (
          <div style={emptyStyle}>
            No charts. Click <strong>+ Chart</strong> to add one.
          </div>
        )}
      </div>
      <PositionSizer />
      <WatchlistPanel onPick={onWatchlistPick} />
      <VnBacktestPanel />
      <AlertPanel alerts={alerts} onClear={clearAlerts} />
      <JournalPanel />
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SymbolSearch open={symbolSearchOpen} onClose={() => setSymbolSearchOpen(false)} onPick={onSymbolSearchPick} />
    </div>
  );
}

function DailyPnlBadge({ pnl }: { pnl: { closedToday: number; rToday: number; pnlAbs: number; wins: number; losses: number } }) {
  if (pnl.closedToday === 0) {
    return <span style={pnlBadgeStyle}><span style={{ color: '#8b949e' }}>Today: no closed trades</span></span>;
  }
  const positive = pnl.rToday >= 0;
  return (
    <span style={pnlBadgeStyle}>
      <span style={{ color: '#8b949e' }}>Today</span>
      <b style={{ color: positive ? '#26a69a' : '#ef5350' }}>
        {positive ? '+' : ''}{pnl.rToday.toFixed(2)}R
      </b>
      <span style={{ color: '#8b949e' }}>· {pnl.wins}W/{pnl.losses}L · {pnl.closedToday} closed</span>
    </span>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
};
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 600, color: '#c9d1d9' };
const emptyStyle: React.CSSProperties = {
  gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: '100%', color: '#8b949e', fontSize: 13, border: '1px dashed #30363d', borderRadius: 4,
};
const pnlBadgeStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
  padding: '4px 10px', background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
};
const helpBtnStyle: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, fontFamily: 'inherit',
  border: '1px solid #30363d', borderRadius: 4, background: '#161b22', color: '#c9d1d9', cursor: 'pointer',
};
const themeBtnStyle: React.CSSProperties = {
  padding: '4px 10px', fontSize: 14, fontFamily: 'inherit',
  border: '1px solid #30363d', borderRadius: 4, background: '#161b22', color: '#c9d1d9', cursor: 'pointer',
};
