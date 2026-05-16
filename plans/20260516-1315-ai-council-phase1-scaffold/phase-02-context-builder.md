# Phase 02 — Context Builder

## Context Links

- `src/server/alerts/alert-engine.ts:36-42` — `snapshots()` returns `Array<{symbol, timeframe, candles}>`.
- `src/shared/indicators/sr-zone-tracker.ts:35` — `computeZones(candles, opts?)` returns `Zone[]`.
- `src/shared/indicators/wave-counter.ts` — `computeWaves` exported (check exact name in file).
- `src/shared/indicators/mtf.ts:46` — `checkMtf({baseCandles, baseTf, entryIdx, direction})`.
- Phase 01 types: `CouncilContext` shape.

## Overview

- **Date:** 2026-05-16
- **Description:** Pure function `buildContext(symbol, timeframe, alertEngine)` returns a `CouncilContext` ready to feed prompt builders. Uses existing AlertEngine candle snapshot + shared indicators.
- **Priority:** P2
- **Status:** pending
- **Review status:** not reviewed

## Key Insights

- Reusing `AlertEngine.snapshots()` keeps council on the same candle bus as alerts — no duplicate fetching, no extra adapter calls.
- `lastCandleTime` is the cache key seed (Phase 03). Must come from the last candle in the matched snapshot, not `Date.now()`.
- MTF direction is ambiguous outside an alert context. Default: derive from the active wave's direction; if no active wave, set `mtf = null` rather than guessing.
- Council should fail loudly if the requested `(symbol, tf)` isn't in `alertEngine.snapshots()` — don't silently fall back to fetch.

## Requirements

**Functional**
- Export `buildContext(symbol: string, timeframe: Timeframe, alertEngine: AlertEngine): CouncilContext | null`.
- Return `null` if no matching snapshot exists.
- `recentCandles`: last 60 closed candles (analysts get more granularity than `analyze.ts`'s 30).
- `zones`: all current zones from `computeZones(candles)`.
- `waves`: all wave counts from `computeWaves(candles)`.
- `mtf`: result of `checkMtf` keyed off the active wave's direction; `null` if no active wave or MTF returns `no-data` on both axes.
- `lastCandleTime`: unix-seconds time of the most recent candle in snapshot.

**Non-Functional**
- File ≤ 100 LOC.
- Pure function — no caching here; cache is orchestrator's job.
- No new dependencies on AlertEngine internals beyond `snapshots()`.

## Architecture

```
AlertEngine.snapshots()
        |
        v
+-------------------+
| buildContext(...) | --> CouncilContext (Phase 01 type)
+-------------------+
        ^
        +---- computeZones, computeWaves, checkMtf (shared indicators)
```

## Related Code Files

**Create**
- `src/server/ai/council/context-builder.ts`

**Modify** — none.

**Delete** — none.

## Implementation Steps

1. Create `src/server/ai/council/context-builder.ts`:
   - Import `AlertEngine`, `computeZones`, `computeWaves`, `checkMtf`, `Timeframe`, `CouncilContext`.
   - Function signature: `export function buildContext(symbol: string, timeframe: Timeframe, alertEngine: AlertEngine): CouncilContext | null`.
   - Find matching snapshot: `alertEngine.snapshots().find(s => s.symbol === symbol && s.timeframe === timeframe)`. Return `null` if absent.
   - Slice last 60 closed candles from `snapshot.candles`.
   - Call `computeZones(candles)` and `computeWaves(candles)`.
   - Find `activeWave = waves.find(w => w.active)`. If present and `candles.length > 0`, call `checkMtf({baseCandles: candles, baseTf: timeframe, entryIdx: candles.length - 1, direction: activeWave.direction})`. Else `mtf = null`.
   - Return `CouncilContext` with `lastCandleTime = candles[candles.length - 1].time`.

2. Run `pnpm exec tsc -p tsconfig.server.json --noEmit`.

## Todo List

- [ ] Confirm `computeWaves` exact export name and signature in `src/shared/indicators/wave-counter.ts`.
- [ ] Create `context-builder.ts` per spec.
- [ ] Null path: returns `null` when no snapshot, not a throw.
- [ ] MTF path: only computes when an active wave exists.
- [ ] `tsc --noEmit` clean.
- [ ] File < 100 LOC.

## Success Criteria

- Given a populated AlertEngine, `buildContext('BTCUSDT', '5m', engine)` returns a non-null `CouncilContext` with non-empty `recentCandles` and `zones`.
- Given an empty AlertEngine, returns `null`.
- No mutation of AlertEngine state.

## Risk Assessment

- **`computeWaves` export name** — if file exports differently (e.g., `WaveCounter` class), wrap accordingly. Verify at step 1.
- **Insufficient HTF history** — `checkMtf` returns `'no-data'` when LTF history is shallow. Acceptable — pass that through to prompts; analysts will note it.
- **Stale snapshot** — if AlertEngine hasn't received a candle in hours, `lastCandleTime` is stale and cache key is "wrong" in the sense that no fresher data exists either. Acceptable for Phase 1.

## Security Considerations

- No external I/O; pure transform of in-memory data.
- No user input flows into indicator code beyond `symbol`/`timeframe` validation (already constrained by AlertEngine's existing types).

## Next Steps

- Phase 03 consumes `buildContext` output and orchestrates the 12 calls.
