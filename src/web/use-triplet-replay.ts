import { useEffect, useRef, useState } from "react";
import type { Candle } from "../shared/types.js";
import type { ReplaySpeed } from "./use-replay.js";

export interface TripletReplay {
  /** null = live mode (all candles visible). */
  cursorTime: number | null;
  playing: boolean;
  speed: ReplaySpeed;
  /** Freeze all 3 charts at this UTC timestamp. */
  enterAt: (time: number) => void;
  /** Enter replay 50 bars before the latest bar. */
  enterReplay: () => void;
  /** Return all 3 charts to live feed. */
  exit: () => void;
  /** Step delta × 5m forward (positive) or backward (negative). */
  step: (delta: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: ReplaySpeed) => void;
  /** Slice a candle array to only candles at or before cursorTime. */
  sliceCandles: (candles: Candle[]) => Candle[];
}

const STEP_SECONDS = 300; // 5-minute bar = 300s

export function useTripletReplay(m5Candles: Candle[]): TripletReplay {
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(2);

  // Use refs to avoid stale closure in the interval
  const maxTimeRef = useRef(0);
  const minTimeRef = useRef(0);
  useEffect(() => {
    maxTimeRef.current = m5Candles[m5Candles.length - 1]?.time ?? 0;
    minTimeRef.current = m5Candles[29]?.time ?? 0; // keep at least 30 bars context
  }, [m5Candles]);

  useEffect(() => {
    if (!playing || cursorTime === null) return;
    const ms = Math.max(50, Math.floor(1000 / speed));
    const id = window.setInterval(() => {
      setCursorTime((prev) => {
        if (prev === null || prev >= maxTimeRef.current) {
          setPlaying(false);
          return prev;
        }
        return prev + STEP_SECONDS;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, speed, cursorTime]);

  const sliceCandles = (candles: Candle[]) =>
    cursorTime === null ? candles : candles.filter((c) => c.time <= cursorTime);

  return {
    cursorTime,
    playing,
    speed,
    enterAt: (time) => {
      setCursorTime(time);
      setPlaying(false);
    },
    enterReplay: () => {
      // Jump 50 bars back from the latest bar
      const target = maxTimeRef.current - 50 * STEP_SECONDS;
      setCursorTime(Math.max(minTimeRef.current, target));
      setPlaying(false);
    },
    exit: () => {
      setCursorTime(null);
      setPlaying(false);
    },
    step: (delta) =>
      setCursorTime((prev) => {
        if (prev === null) return prev;
        return Math.max(
          minTimeRef.current,
          Math.min(maxTimeRef.current, prev + delta * STEP_SECONDS),
        );
      }),
    setPlaying,
    setSpeed,
    sliceCandles,
  };
}
