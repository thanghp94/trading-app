import { useState } from 'react';
import { Chart } from './components/Chart.js';
import { useFeed } from './use-feed.js';
import { useZones } from './use-zones.js';
import type { Timeframe } from '../shared/types.js';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

interface SymbolPreset {
  ticker: string;
  label: string;
  /** Brief disclosure when the ticker is a proxy (e.g. PAXGUSDT for gold). */
  note?: string;
}

const SYMBOL_PRESETS: SymbolPreset[] = [
  { ticker: 'BTCUSDT', label: 'BTC' },
  { ticker: 'ETHUSDT', label: 'ETH' },
  { ticker: 'SOLUSDT', label: 'SOL' },
  { ticker: 'XAUUSD', label: 'XAU/USD', note: 'Real spot XAU/USD via TwelveData (free, works in VN). Requires TWELVEDATA_API_KEY in .env — falls back to an error message if unset. Updates every ~2 min on free tier.' },
  { ticker: 'EURUSD', label: 'EUR/USD', note: 'Spot forex via TwelveData.' },
  { ticker: 'PAXGUSDT', label: 'PAXG', note: 'Tokenized gold (Binance) — proxy for XAU/USD, tracks within ~0.3% weekdays. Use XAU/USD for the real thing.' },
];

export function App() {
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const { candles, status, error } = useFeed({ symbol, timeframe });
  const zones = useZones(candles);

  const active = zones.filter((z) => z.state === 'active').length;
  const broken = zones.filter((z) => z.state === 'broken').length;
  const flipped = zones.filter((z) => z.flipped).length;
  const note = SYMBOL_PRESETS.find((p) => p.ticker === symbol)?.note;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{symbol}</h1>
          <span style={{ fontSize: 13, opacity: 0.6 }}>· {timeframe}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <SymbolSelector value={symbol} onChange={setSymbol} />
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />
        </div>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          status: {status} · zones: {active} active · {broken} broken{flipped ? ` · ${flipped} flipped` : ''}
        </span>
      </header>
      {error && (
        <div style={{ fontSize: 12, color: '#f85149', marginBottom: 6, padding: '6px 10px', border: '1px solid #f85149', borderRadius: 4, background: 'rgba(248, 81, 73, 0.1)' }}>
          ✗ {error}
        </div>
      )}
      {!error && note && (
        <div style={{ fontSize: 11, color: '#d4a72c', marginBottom: 6 }}>
          ⚠ {note}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Chart candles={candles} zones={zones} />
      </div>
    </div>
  );
}

function SymbolSelector({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {SYMBOL_PRESETS.map((p) => {
        const active = p.ticker === value;
        return (
          <button
            key={p.ticker}
            type="button"
            onClick={() => onChange(p.ticker)}
            title={p.ticker + (p.note ? ` — ${p.note}` : '')}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontFamily: 'inherit',
              border: '1px solid #30363d',
              borderRadius: 4,
              background: active ? '#1f6feb' : '#161b22',
              color: active ? '#fff' : '#c9d1d9',
              cursor: 'pointer',
              minWidth: 48,
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function TimeframeSelector({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
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
