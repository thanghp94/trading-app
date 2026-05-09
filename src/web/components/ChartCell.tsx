import { Chart } from './Chart.js';
import { useFeed } from '../use-feed.js';
import { useZones } from '../use-zones.js';
import type { Timeframe } from '../../shared/types.js';
import type { CellConfig } from '../use-layout.js';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

/**
 * Symbols the user can pick per cell. Group prefixes help the dropdown stay
 * readable when the list grows. Adding new tickers here is enough — backend
 * routing in SymbolManager already handles crypto vs forex/metals.
 */
const SYMBOL_GROUPS: Array<{ label: string; symbols: string[] }> = [
  { label: 'Crypto (Binance)', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'PAXGUSDT', 'XAUTUSDT'] },
  { label: 'Forex/Metals (TwelveData)', symbols: ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'] },
];

interface ChartCellProps {
  cell: CellConfig;
  onChange: (patch: Partial<CellConfig>) => void;
  onRemove: () => void;
}

export function ChartCell({ cell, onChange, onRemove }: ChartCellProps) {
  const { candles, status, error } = useFeed({ symbol: cell.symbol, timeframe: cell.timeframe });
  const zones = useZones(candles);
  const active = zones.filter((z) => z.state === 'active').length;
  const broken = zones.filter((z) => z.state === 'broken').length;
  const flipped = zones.filter((z) => z.flipped).length;

  return (
    <div style={cellWrapStyle}>
      <div style={toolbarStyle}>
        <select value={cell.symbol} onChange={(e) => onChange({ symbol: e.target.value })} style={selectStyle}>
          {SYMBOL_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.symbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={cell.timeframe}
          onChange={(e) => onChange({ timeframe: e.target.value as Timeframe })}
          style={selectStyle}
        >
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </select>
        <span style={statusStyle}>
          {error ? '✗' : status === 'live' ? '●' : status === 'connecting' ? '◌' : '○'}
          <span style={{ marginLeft: 4, opacity: 0.7 }}>
            {active}a · {broken}b{flipped ? ` · ${flipped}f` : ''}
          </span>
        </span>
        <button type="button" onClick={onRemove} title="Remove chart" style={removeBtnStyle}>×</button>
      </div>
      {error && <div style={errorBannerStyle}>✗ {error}</div>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Chart candles={candles} zones={zones} />
      </div>
    </div>
  );
}

const cellWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  border: '1px solid #30363d',
  borderRadius: 4,
  overflow: 'hidden',
  background: '#0d1117',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 6px',
  background: '#161b22',
  borderBottom: '1px solid #30363d',
};

const selectStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '2px 4px',
  background: '#0d1117',
  color: '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: 3,
  cursor: 'pointer',
};

const statusStyle: React.CSSProperties = {
  fontSize: 11,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  color: '#8b949e',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#8b949e',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: '0 6px',
};

const errorBannerStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#f85149',
  padding: '4px 8px',
  background: 'rgba(248, 81, 73, 0.08)',
  borderBottom: '1px solid rgba(248, 81, 73, 0.4)',
};
