# Phase 2: Triplet Synchronized Replay

## Overview
Shared UTC-timestamp cursor across all 3 triplet cells. Play advances by 5m ticks.
15m bar forms after 3 ticks, 1H bar forms after 12 ticks — no ratio math, just time filtering.

## Why timestamp-based (not index ratios)
- Index approach: 15m cursor = floor(5m_cursor / 3) breaks on data gaps
- Time approach: each chart shows candles where `c.time <= cursorTime` — always correct

## New files
- `src/web/use-triplet-replay.ts`
- `src/web/components/TripletView.tsx`

## Modified files
- `src/web/App.tsx` — detect triplet → render TripletView
- `src/web/use-layout.ts` — export triplet detection helper

---

## `use-triplet-replay.ts`

```typescript
import { useEffect, useState } from 'react';
import type { Candle } from '../shared/types.js';
import type { ReplaySpeed } from './use-replay.js';

export interface TripletReplay {
  cursorTime: number | null;  // null = live
  playing: boolean;
  speed: ReplaySpeed;
  enterAt: (time: number) => void;
  exit: () => void;
  step: (delta: number) => void;  // delta in bars (1 bar = 300s)
  setPlaying: (p: boolean) => void;
  setSpeed: (s: ReplaySpeed) => void;
  sliceCandles: (candles: Candle[]) => Candle[];
}

export function useTripletReplay(m5Candles: Candle[]): TripletReplay {
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(2);

  const STEP = 300; // 5m in seconds
  const maxTime = m5Candles[m5Candles.length - 1]?.time ?? 0;
  const minTime = m5Candles[29]?.time ?? 0; // keep at least 30 bars of context

  useEffect(() => {
    if (!playing || cursorTime === null) return;
    const ms = Math.max(50, Math.floor(1000 / speed));
    const id = window.setInterval(() => {
      setCursorTime((prev) => {
        if (prev === null || prev >= maxTime) {
          setPlaying(false);
          return prev;
        }
        return prev + STEP;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, speed, cursorTime, maxTime]);

  return {
    cursorTime,
    playing,
    speed,
    enterAt: (time) => { setCursorTime(time); setPlaying(false); },
    exit: () => { setCursorTime(null); setPlaying(false); },
    step: (delta) => setCursorTime((prev) => {
      if (prev === null) return prev;
      return Math.max(minTime, Math.min(maxTime, prev + delta * STEP));
    }),
    setPlaying,
    setSpeed,
    sliceCandles: (candles) =>
      cursorTime === null ? candles : candles.filter((c) => c.time <= cursorTime),
  };
}
```

---

## `TripletView.tsx`

Structure:
```
TripletView
  ├── calls useFeed × 3 (h1, 15m, 5m)
  ├── calls useTripletReplay(m5LiveCandles)
  ├── shared toolbar row: symbol label + Live/step/play/speed + "Exit triplet" button
  └── 3-column grid (1H | 15m | 5m)
        each column:
          ├── timeframe label
          └── <Chart
                candles={tripletReplay.sliceCandles(hXCandles)}
                onBarClick={(time) => tripletReplay.enterAt(time)}
                zones / waves / emas computed from sliced candles
              />
```

Key props accepted by TripletView:
```typescript
interface TripletViewProps {
  symbol: string;
  onExit: () => void;  // callback to return to normal grid layout
}
```

Each column uses `useZones`, `useWaves`, `useEmas` on the **sliced** candles so indicators show historical state at cursor time.

Replay controls in the shared toolbar:
- `Live` button → `tripletReplay.exit()`
- `◀` `▶` `⏪` `⏩` → step 1 or 10 bars
- `▶/⏸` → play/pause
- speed selector
- Progress: `{cursorTime formatted} · {N bars behind live}`

---

## `App.tsx` — triplet detection

```typescript
// Triplet: openTriplet() stamps cells with id prefix "tr-"
const isTriplet = layout.cells.length === 3 &&
  layout.cells.every((c) => c.id.startsWith('tr-'));

// In JSX:
{isTriplet ? (
  <TripletView symbol={layout.cells[0].symbol} onExit={reset} />
) : (
  // existing grid of ChartCells
)}
```

---

## Behaviour after this phase

| Action | Result |
|--------|--------|
| Click "Triplet" button | Opens TripletView for that symbol |
| Click any bar in 5m chart | All 3 charts freeze at that time |
| Click bar in 15m or 1H | Same — all sync to that timestamp |
| Press play | 5m cursor advances 300s/tick; 15m bar advances every 3 ticks; 1H every 12 |
| Press Live | All 3 charts return to live feed |

---

## Todo

- [ ] Create `use-triplet-replay.ts`
- [ ] Create `TripletView.tsx` — shared toolbar + 3-column layout
- [ ] Wire `useFeed` × 3 inside TripletView
- [ ] Wire `useZones/useWaves/useEmas` per column on sliced candles
- [ ] Add triplet detection in `App.tsx`
- [ ] Test: play from 5m bar → 15m bar updates at 3-bar intervals
- [ ] Test: click 1H bar → all 3 charts freeze at that timestamp
- [ ] Test: Live button → all 3 resume real-time

## Risk
- `useFeed` inside TripletView creates 3 WebSocket subscriptions simultaneously — same as 3 ChartCells so no new overhead
- If symbol has no 1H history loaded yet, sliceCandles returns [] — show loading indicator
