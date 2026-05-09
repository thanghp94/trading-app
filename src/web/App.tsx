import { Chart } from './components/Chart.js';
import { useFeed } from './use-feed.js';
import { useZones } from './use-zones.js';

export function App() {
  const { candles, status } = useFeed({ symbol: 'BTCUSDT', timeframe: '5m' });
  const zones = useZones(candles);

  const active = zones.filter((z) => z.state === 'active').length;
  const broken = zones.filter((z) => z.state === 'broken').length;
  const flipped = zones.filter((z) => z.flipped).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>BTCUSDT · 5m</h1>
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
