import { Chart } from './Chart.js';
import { ReplayControls } from './ReplayControls.js';
import { AnalyzeButton } from './AnalyzeButton.js';
import { BacktestPanel } from './BacktestPanel.js';
import { heikinAshi } from '../../shared/indicators/heikin-ashi.js';
import { useFeed } from '../use-feed.js';
import { useZones } from '../use-zones.js';
import { useWaves } from '../use-waves.js';
import { useEmas } from '../use-emas.js';
import { useHtfZones } from '../use-htf-zones.js';
import { useReplay } from '../use-replay.js';
import type { Timeframe } from '../../shared/types.js';
import type { CellConfig } from '../use-layout.js';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const SYMBOL_GROUPS: Array<{ label: string; symbols: string[] }> = [
  { label: 'Crypto (Binance)', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'PAXGUSDT', 'XAUTUSDT'] },
  { label: 'Forex/Metals (TwelveData)', symbols: ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'] },
  { label: 'VN equities (TCBS)', symbols: ['HPG', 'VCB', 'FPT', 'MWG', 'VHM', 'VNM', 'VIC', 'MSN', 'TCB', 'VN30F1M'] },
];

interface ChartCellProps {
  cell: CellConfig;
  /** Active cell receives keyboard shortcut focus (1-6 timeframe, etc). */
  active?: boolean;
  onChange: (patch: Partial<CellConfig>) => void;
  onRemove: () => void;
  onFocus?: () => void;
}

export function ChartCell({ cell, active: isActive, onChange, onRemove, onFocus }: ChartCellProps) {
  const { candles: liveCandles, status, error } = useFeed({ symbol: cell.symbol, timeframe: cell.timeframe });
  const replay = useReplay(liveCandles);
  const candles = replay.candles;
  const zones = useZones(candles);
  const waves = useWaves(candles);
  const emas = useEmas(candles);
  const htfZones = useHtfZones(candles, cell.timeframe);

  const active = zones.filter((z) => z.state === 'active').length;
  const broken = zones.filter((z) => z.state === 'broken').length;
  const flipped = zones.filter((z) => z.flipped).length;
  const activeWaves = waves.filter((w) => w.active).length;
  const completedWaves = waves.filter((w) => w.resetReason === 'completed').length;

  return (
    <div
      style={{ ...cellWrapStyle, borderColor: isActive ? '#1f6feb' : '#30363d', boxShadow: isActive ? '0 0 0 1px #1f6feb' : undefined }}
      onClick={onFocus}
    >
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
        <button
          type="button"
          onClick={() => onChange({ showEmas: !cell.showEmas })}
          title="Toggle EMA(20/50/200)"
          style={{ ...toggleBtnStyle, ...(cell.showEmas ? toggleActiveStyle : {}) }}
        >
          EMA
        </button>
        <button
          type="button"
          onClick={() => onChange({ showHtfZones: !cell.showHtfZones })}
          title="Toggle higher-timeframe zone overlay"
          style={{ ...toggleBtnStyle, ...(cell.showHtfZones ? toggleActiveStyle : {}) }}
        >
          HTF
        </button>
        <button
          type="button"
          onClick={() => onChange({ heikinAshi: !cell.heikinAshi })}
          title="Toggle Heikin-Ashi candle smoothing"
          style={{ ...toggleBtnStyle, ...(cell.heikinAshi ? toggleActiveStyle : {}) }}
        >
          HA
        </button>
        <AnalyzeButton symbol={cell.symbol} timeframe={cell.timeframe} candles={candles} zones={zones} waves={waves} />
        <BacktestPanel symbol={cell.symbol} timeframe={cell.timeframe} candles={candles} />
        <ReplayControls
          mode={replay.mode}
          cursor={replay.cursor}
          total={replay.total}
          playing={replay.playing}
          speed={replay.speed}
          onEnterReplay={replay.enterReplay}
          onExitReplay={replay.exitReplay}
          onStep={replay.step}
          onPlay={replay.setPlaying}
          onSpeed={replay.setSpeed}
        />
        <span style={statusStyle}>
          {error ? '✗' : status === 'live' ? '●' : status === 'connecting' ? '◌' : '○'}
          <span style={{ marginLeft: 4, opacity: 0.7 }}>
            zones {active}a·{broken}b{flipped ? `·${flipped}f` : ''}
            {(activeWaves + completedWaves) > 0 && (
              <>
                {' · waves '}
                {activeWaves}●{completedWaves > 0 ? `·${completedWaves}✓` : ''}
              </>
            )}
          </span>
        </span>
        <button type="button" onClick={onRemove} title="Remove chart" style={removeBtnStyle}>×</button>
      </div>
      {error && <div style={errorBannerStyle}>✗ {error}</div>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Chart
          candles={cell.heikinAshi ? heikinAshi(candles) : candles}
          zones={zones}
          htfZones={cell.showHtfZones ? htfZones : []}
          waves={waves}
          emas={cell.showEmas ? emas : []}
        />
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
  flexWrap: 'wrap',
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

const toggleBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: 11,
  fontFamily: 'inherit',
  border: '1px solid #30363d',
  borderRadius: 3,
  background: '#0d1117',
  color: '#8b949e',
  cursor: 'pointer',
  minWidth: 32,
};

const toggleActiveStyle: React.CSSProperties = {
  background: '#1f6feb',
  color: '#fff',
  borderColor: '#1f6feb',
};

const statusStyle: React.CSSProperties = {
  fontSize: 11,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  color: '#8b949e',
  marginLeft: 'auto',
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
