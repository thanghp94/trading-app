import { useEffect, useState } from 'react';
import type { Candle } from '../shared/types.js';

export type ReplayMode = 'live' | 'replay';
/** Bars per second when auto-playing. */
export type ReplaySpeed = 1 | 2 | 5 | 10 | 20;

interface ReplayState {
  /** The visible candle slice — `liveCandles` when live, sliced when replaying. */
  candles: Candle[];
  mode: ReplayMode;
  cursor: number;
  total: number;
  playing: boolean;
  speed: ReplaySpeed;
  enterReplay: () => void;
  exitReplay: () => void;
  step: (delta: number) => void;
  jumpTo: (idx: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: ReplaySpeed) => void;
}

/**
 * "Cut the future candles" — replay mode shows only candles[0..cursor],
 * letting all indicators recompute exactly as they would have at that
 * moment in history. Useful for practicing entries and tuning thresholds
 * against real (not synth) data.
 *
 * Live mode: cursor follows the latest bar; new ticks update the chart.
 * Replay mode: cursor frozen; user steps forward/back manually or auto-plays.
 *
 * When entering replay we jump the cursor 50 bars (or 30% of history)
 * before the latest bar, so you start with usable lookback context.
 */
export function useReplay(liveCandles: Candle[]): ReplayState {
  const [mode, setMode] = useState<ReplayMode>('live');
  const [cursor, setCursor] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(2);

  // Live mode: cursor pinned to latest bar. Replay mode: cursor stays put,
  // even though new bars may keep arriving in liveCandles.
  useEffect(() => {
    if (mode === 'live') setCursor(liveCandles.length);
  }, [mode, liveCandles.length]);

  // Auto-play step.
  useEffect(() => {
    if (!playing || mode !== 'replay') return;
    const ms = Math.max(50, Math.floor(1000 / speed));
    const id = window.setInterval(() => {
      setCursor((c) => {
        if (c >= liveCandles.length) {
          setPlaying(false);
          return liveCandles.length;
        }
        return c + 1;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, mode, speed, liveCandles.length]);

  const enterReplay = () => {
    if (liveCandles.length < 60) return; // not enough history to be useful
    const start = Math.max(50, Math.floor(liveCandles.length * 0.7));
    setCursor(start);
    setMode('replay');
    setPlaying(false);
  };
  const exitReplay = () => {
    setPlaying(false);
    setMode('live');
  };
  const step = (delta: number) => {
    setCursor((c) => Math.max(30, Math.min(liveCandles.length, c + delta)));
  };
  const jumpTo = (idx: number) => {
    setCursor(Math.max(30, Math.min(liveCandles.length, idx)));
  };

  const candles =
    mode === 'live' ? liveCandles : liveCandles.slice(0, Math.min(cursor, liveCandles.length));

  return {
    candles,
    mode,
    cursor: mode === 'live' ? liveCandles.length : cursor,
    total: liveCandles.length,
    playing,
    speed,
    enterReplay,
    exitReplay,
    step,
    jumpTo,
    setPlaying,
    setSpeed,
  };
}
