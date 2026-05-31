# Phase 1: Click-to-Replay (per cell)

## Overview
Wire chart bar-click → enter replay at that bar. Independent per cell. No triplet dependency.

## Files to modify
- `src/web/components/Chart.tsx`
- `src/web/components/ChartCell.tsx`
- `src/web/use-replay.ts`

## Implementation steps

### 1. `use-replay.ts` — add `enterReplayAt(idx)`

Current `enterReplay()` always jumps to 70% of history. Add a variant that accepts a specific index:

```typescript
const enterReplayAt = (idx: number) => {
  if (liveCandles.length < 60) return;
  setCursor(Math.max(30, Math.min(liveCandles.length, idx)));
  setMode('replay');
  setPlaying(false);
};
```

Export from `ReplayState` interface.

### 2. `Chart.tsx` — expose `onBarClick` prop

Add to `ChartProps`:
```typescript
onBarClick?: (time: number) => void;
```

In the existing `subscribeClick` handler (line ~162), after resolving `t`:
```typescript
const onClick = (param) => {
  if (selfClicking) return;
  const raw = param.time;
  const t = typeof raw === 'number' ? raw : null;
  if (t != null) {
    if (symbolRef.current) clickBus.publish(t, symbolRef.current);
    onBarClickRef.current?.(t);  // NEW
  }
};
```

Use a ref for `onBarClick` to avoid stale closure in the subscribeClick effect:
```typescript
const onBarClickRef = useRef(onBarClick);
useEffect(() => { onBarClickRef.current = onBarClick; }, [onBarClick]);
```

### 3. `ChartCell.tsx` — wire to replay

Pass `onBarClick` to `<Chart>`:
```tsx
onBarClick={(time) => {
  // Find index in liveCandles by timestamp
  const idx = liveCandles.findIndex((c) => c.time >= time);
  if (idx > 0) replay.enterReplayAt(idx);
}}
```

**Note:** Use `liveCandles` (not `candles`) so the index maps to the full array, not the sliced replay window.

## Behaviour after this phase
- Click any bar → chart freezes there, future bars hidden
- ReplayControls appear automatically (already wired to `replay.mode`)
- Step/play/Live button work as before
- Click in replay mode → jumps cursor to clicked bar

## Todo
- [ ] Add `enterReplayAt` to `use-replay.ts`
- [ ] Add `onBarClickRef` + call in `Chart.tsx` `subscribeClick`
- [ ] Add `onBarClick` prop to ChartProps
- [ ] Wire `onBarClick` in `ChartCell.tsx`
- [ ] Test: click bar → replay enters at correct position
- [ ] Test: click during replay → cursor jumps, doesn't re-enter replay
