import type { ReplaySpeed } from '../use-replay.js';

interface ReplayControlsProps {
  mode: 'live' | 'replay';
  cursor: number;
  total: number;
  playing: boolean;
  speed: ReplaySpeed;
  onEnterReplay: () => void;
  onExitReplay: () => void;
  onStep: (delta: number) => void;
  onPlay: (p: boolean) => void;
  onSpeed: (s: ReplaySpeed) => void;
}

const SPEEDS: ReplaySpeed[] = [1, 2, 5, 10, 20];

/**
 * Compact replay toolbar that fits inside a ChartCell header.
 * Live mode → just a "Replay" button. Replay mode → step / play / speed.
 */
export function ReplayControls(p: ReplayControlsProps) {
  if (p.mode === 'live') {
    return (
      <button type="button" onClick={p.onEnterReplay} title="Replay history bar-by-bar" style={btnStyle}>
        ⏯ Replay
      </button>
    );
  }

  const remaining = p.total - p.cursor;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11 }}>
      <button type="button" onClick={p.onExitReplay} title="Back to live" style={{ ...btnStyle, background: '#1f6feb', color: '#fff' }}>
        Live
      </button>
      <button type="button" onClick={() => p.onStep(-10)} title="Back 10 bars" style={btnStyle}>
        ⏪
      </button>
      <button type="button" onClick={() => p.onStep(-1)} title="Back 1 bar" style={btnStyle}>
        ◀
      </button>
      <button type="button" onClick={() => p.onPlay(!p.playing)} title={p.playing ? 'Pause' : 'Play'} style={btnStyle}>
        {p.playing ? '⏸' : '▶'}
      </button>
      <button type="button" onClick={() => p.onStep(1)} title="Forward 1 bar" style={btnStyle}>
        ▶
      </button>
      <button type="button" onClick={() => p.onStep(10)} title="Forward 10 bars" style={btnStyle}>
        ⏩
      </button>
      <select
        value={p.speed}
        onChange={(e) => p.onSpeed(Number(e.target.value) as ReplaySpeed)}
        title="Bars per second when playing"
        style={selectStyle}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
      <span style={{ marginLeft: 4, color: '#8b949e', fontFamily: 'inherit' }}>
        {p.cursor}/{p.total} ({remaining} ahead)
      </span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: 11,
  fontFamily: 'inherit',
  border: '1px solid #30363d',
  borderRadius: 3,
  background: '#161b22',
  color: '#c9d1d9',
  cursor: 'pointer',
  minWidth: 24,
  lineHeight: 1.2,
};

const selectStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '1px 2px',
  background: '#0d1117',
  color: '#c9d1d9',
  border: '1px solid #30363d',
  borderRadius: 3,
  marginLeft: 2,
};
