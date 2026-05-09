import { ChartCell } from './components/ChartCell.js';
import { LayoutControls } from './components/LayoutControls.js';
import { AlertPanel } from './components/AlertPanel.js';
import { JournalPanel } from './components/JournalPanel.js';
import { useLayout } from './use-layout.js';
import { useAlerts } from './use-alerts.js';

export function App() {
  const { layout, updateCell, addCell, removeCell, setCols, reset } = useLayout();
  const { alerts, clearAlerts } = useAlerts();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 8, gap: 8 }}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Trading App</h1>
        <LayoutControls
          cols={layout.cols}
          cellCount={layout.cells.length}
          onCols={setCols}
          onAddChart={addCell}
          onReset={reset}
        />
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
        {layout.cells.map((cell) => (
          <ChartCell
            key={cell.id}
            cell={cell}
            onChange={(patch) => updateCell(cell.id, patch)}
            onRemove={() => removeCell(cell.id)}
          />
        ))}
        {layout.cells.length === 0 && (
          <div style={emptyStyle}>
            No charts. Click <strong>+ Chart</strong> to add one.
          </div>
        )}
      </div>
      <AlertPanel alerts={alerts} onClear={clearAlerts} />
      <JournalPanel />
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: '#c9d1d9',
};

const emptyStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#8b949e',
  fontSize: 13,
  border: '1px dashed #30363d',
  borderRadius: 4,
};
