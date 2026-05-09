import { useState } from 'react';
import type { Candle, Timeframe, Zone } from '../../shared/types.js';
import type { WaveCount } from '../../shared/indicators/wave-counter.js';

interface AnalyzeButtonProps {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  zones: Zone[];
  waves: WaveCount[];
}

interface Result {
  ok: boolean;
  text?: string;
  error?: string;
  costUsd?: number;
}

/**
 * Per-cell "Analyze" button. Sends recent candles + zones + waves to
 * /api/analyze (which calls Claude Haiku) and shows the response in a
 * floating panel below the button.
 *
 * Costs ~$0.0015 per analysis. Click as much as you want.
 */
export function AnalyzeButton(props: AnalyzeButtonProps) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setBusy(true);
    setOpen(true);
    setResult(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: props.symbol,
          timeframe: props.timeframe,
          candles: props.candles.slice(-100),
          zones: props.zones,
          waves: props.waves,
        }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => (open && !busy ? setOpen(false) : run())}
        title="Send the chart to Claude Haiku for a quick read"
        style={{ ...btnStyle, ...(open ? activeBtnStyle : {}) }}
      >
        🧠 {busy ? 'Analyzing…' : 'Analyze'}
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <span>{props.symbol} {props.timeframe} — Claude Haiku</span>
            <button type="button" onClick={() => setOpen(false)} style={closeBtnStyle}>×</button>
          </div>
          <div style={panelBodyStyle}>
            {busy && <div style={{ color: '#8b949e' }}>Thinking…</div>}
            {!busy && result?.ok && (
              <>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{result.text}</div>
                {result.costUsd != null && (
                  <div style={{ marginTop: 8, fontSize: 10, color: '#8b949e' }}>
                    cost: ${result.costUsd.toFixed(4)}
                  </div>
                )}
              </>
            )}
            {!busy && result && !result.ok && (
              <div style={{ color: '#f85149' }}>✗ {result.error}</div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: 11,
  fontFamily: 'inherit',
  border: '1px solid #30363d',
  borderRadius: 3,
  background: '#0d1117',
  color: '#8b949e',
  cursor: 'pointer',
};

const activeBtnStyle: React.CSSProperties = {
  background: '#1f6feb',
  color: '#fff',
  borderColor: '#1f6feb',
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  marginTop: 4,
  right: 0,
  width: 360,
  maxHeight: 360,
  overflowY: 'auto',
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 4,
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  zIndex: 50,
  fontSize: 12,
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 8px',
  background: '#161b22',
  borderBottom: '1px solid #30363d',
  fontSize: 11,
  color: '#c9d1d9',
};

const panelBodyStyle: React.CSSProperties = {
  padding: 10,
  color: '#c9d1d9',
  fontSize: 12,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#8b949e',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: '0 4px',
};
