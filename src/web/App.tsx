import { useState } from 'react';
import { Chart } from './components/Chart.js';
import { useFeed } from './use-feed.js';
import { useZones } from './use-zones.js';
import type { Timeframe } from '../shared/types.js';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export function App() {
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const { candles, status } = useFeed({ symbol: 'BTCUSDT', timeframe });
  const zones = useZones(candles);

  const active = zones.filter((z) => z.state === 'active').length;
  const broken = zones.filter((z) => z.state === 'broken').length;
  const flipped = zones.filter((z) => z.flipped).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>BTCUSDT · {timeframe}</h1>
        <TimeframeSelector value={timeframe} onChange={setTimeframe} />
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          status: {status} · zones: {active} active · {broken} broken{flipped ? ` · ${flipped} flipped` : ''}
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Chart candles={candles} zones={zones} />
      </div>
    </div>
  );
}

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}

function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {TIMEFRAMES.map((tf) => {
        const active = tf === value;
        return (
          <button
            key={tf}
            type="button"
            onClick={() => onChange(tf)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontFamily: 'inherit',
              border: '1px solid #30363d',
              borderRadius: 4,
              background: active ? '#1f6feb' : '#161b22',
              color: active ? '#fff' : '#c9d1d9',
              cursor: 'pointer',
              minWidth: 36,
            }}
          >
            {tf}
          </button>
        );
      })}
    </div>
  );
}
