import { useEffect, useRef, useState } from "react";
import type { Candle } from "../shared/types.js";

export type ReplayMode = "live" | "replay";
/** Bars per second when auto-playing (1–100). */
export type ReplaySpeed = number;

interface ReplayState {
  /** The visible candle slice — `liveCandles` when live, sliced when replaying. */
  candles: Candle[];
  mode: ReplayMode;
  cursor: number;
  total: number;
  playing: boolean;
  speed: ReplaySpeed;
  enterReplay: () => void;
  /** Enter replay pinned to a specific bar index (from a bar-click). */
  enterReplayAt: (idx: number) => void;
  exitReplay: () => void;
  /** Play at full speed to live, then auto-exit replay. */
  fastForwardToLive: () => void;
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
 */
export function useReplay(liveCandles: Candle[]): ReplayState {
  const [mode, setMode] = useState<ReplayMode>("live");
  const [cursor, setCursor] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(2);

  // Ref so interval closure always sees the current live count without
  // restarting the interval every time a new candle arrives (e.g. entrade poll).
  const liveCountRef = useRef(liveCandles.length);
  liveCountRef.current = liveCandles.length;

  // Live mode: keep cursor pinned to the latest bar.
  useEffect(() => {
    if (mode === "live") setCursor(liveCandles.length);
  }, [mode, liveCandles.length]);

  // Auto-play tick — only depends on playing/mode/speed, not candle count.
  useEffect(() => {
    if (!playing || mode !== "replay") return;
    const ms = Math.max(10, Math.floor(1000 / speed));
    const id = window.setInterval(() => {
      setCursor((c) => Math.min(c + 1, liveCountRef.current));
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, mode, speed]);

  // Auto-exit replay when playback reaches live — separate effect, no setState-in-setState.
  useEffect(() => {
    if (mode === "replay" && playing && cursor >= liveCandles.length) {
      setPlaying(false);
      setMode("live");
    }
  }, [cursor, mode, playing, liveCandles.length]);

  const enterReplay = () => {
    if (liveCandles.length < 30) return;
    const start = Math.max(20, Math.floor(liveCandles.length * 0.7));
    setCursor(start);
    setMode("replay");
    setPlaying(false);
  };

  const enterReplayAt = (idx: number) => {
    if (liveCandles.length < 10) return;
    setCursor(Math.max(5, Math.min(liveCandles.length, idx)));
    setMode("replay");
    setPlaying(false);
  };

  const exitReplay = () => {
    setPlaying(false);
    setMode("live");
  };

  const fastForwardToLive = () => {
    setSpeed(100);
    setPlaying(true);
  };

  const step = (delta: number) => {
    setCursor((c) => Math.max(5, Math.min(liveCandles.length, c + delta)));
  };

  const jumpTo = (idx: number) => {
    setCursor(Math.max(5, Math.min(liveCandles.length, idx)));
  };

  const candles =
    mode === "live"
      ? liveCandles
      : liveCandles.slice(0, Math.min(cursor, liveCandles.length));

  return {
    candles,
    mode,
    cursor: mode === "live" ? liveCandles.length : cursor,
    total: liveCandles.length,
    playing,
    speed,
    enterReplay,
    enterReplayAt,
    exitReplay,
    fastForwardToLive,
    step,
    jumpTo,
    setPlaying,
    setSpeed,
  };
}
