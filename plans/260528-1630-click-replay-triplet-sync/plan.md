# Click-to-Replay + Triplet Synchronized Multi-TF Replay

## Status: Ready to implement

## Design validation

**The system is excellent.** Using a shared UTC timestamp cursor (not index ratios) is the right call:
- Handles data gaps between feeds correctly
- 1H bar advances exactly when wall-clock crosses the boundary — no ratio math needed
- Teaches real multi-TF discipline: you see 1H bar form from 4×15m bars forming from 3×5m bars each

## Phases

| # | Phase | Files | Status |
|---|-------|-------|--------|
| 1 | [Click-to-replay (per cell)](./phase-01-click-to-replay.md) | Chart, ChartCell, use-replay | Todo |
| 2 | [Triplet synchronized replay](./phase-02-triplet-sync-replay.md) | use-triplet-replay, TripletView, App | Todo |

## Architecture decision

Triplet replay uses a **new `TripletView` component** (not retrofitting `ChartCell`):
- `TripletView` owns all 3 `useFeed` subscriptions + `useTripletReplay`
- App.tsx detects triplet layout (`tr-` cell id prefix) → renders `TripletView` instead of 3 `ChartCell`s
- Clean separation: regular cells = independent replay, triplet = shared timestamp cursor
