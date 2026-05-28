# Phase 01 — Blackbox Engine (L2)

**Priority:** P0 (the differentiator). **Status:** todo. **Data:** OHLCV proxy.
**Math:** [blackbox-math.md](./blackbox-math.md) is canonical — implement it exactly.

Pure compute layer: daily DM/DS series → cumulative TMC, windowed cycles, normalized oscillators, signals. No UI. Validated against price before anything reads it.

## Files (all pure, testable, <200 lines each)

**Create — `src/shared/blackbox/`**
- `types.ts` — `BlackboxSnapshot`, `CycleSeries`, `Signal`, `BBStatus`, `XHCau` enums.
- `money-flow-proxy.ts` — `[PROXY]` DM_daily/DS_daily from `Candle[]` (daily signed flow + CLV). Optional intraday refine (60d 1m).
- `box-level.ts` — cumulative `box[]`, anchor min-max → `TMC`, `TMA20/50`. Store-raw/derive-on-read.
- `cycles.ts` — windowed `DMx/DSx` (3/5/10/20/50/200), `Tốc độ_x = DMx − DSx`.
- `normalize.ts` — `CHDMx/CHDSx` (50-session min-max → 0-100). Reused by both modes.
- `indices.ts` — `DSPI` (±1), `MPIC` (0-100), `BB-Status`, `XH-Cầu`, forecast transition flags.
- `signals.ts` — Uốn 20/30/70/80 (+slope flip), tiền vào N phiên, đảo chiều T+, Cơ hội T+/T++/sóng.
- `compute.ts` — orchestrator: `computeBlackbox(series): BlackboxResult` (calls all above).

**Modify**
- `src/server/blackbox/backfill-job.ts` — replace Phase-00 stub with real `moneyFlowProxy`.

**Read for context**
- `src/shared/indicators/{rsi,ema,atr}.ts` — reuse SMA/EMA/normalization helpers, don't duplicate.
- existing indicator style (pure functions, NaN warmup) — match it.

## Steps

1. `types.ts` + `money-flow-proxy.ts` (DM/DS daily).
2. `box-level.ts` (TMC anchor-normalized) + unit test vs hand-calc.
3. `cycles.ts` + `normalize.ts` (DMx/DSx, CHDMx, Tốc độ).
4. `indices.ts` (DSPI, MPIC, BB-Status, XH-Cầu).
5. `signals.ts` (Uốn + consecutive-day + reversal).
6. `compute.ts` orchestrator → `BlackboxResult` per symbol.
7. Wire into backfill; recompute on daily append.

## Validation (gate — do NOT skip)

- `scripts/validate-blackbox.ts`: run on HPG/VCB/FPT/MWG/SSI, overlay TMC + Uốn-lên markers on price (reuse chart or dump CSV).
- Check: hấp dẫn+uốn-lên precedes up-moves > chance. If curve = noise → stop, reconsider proxy before Phase 02/03.

## Todo

- [ ] types + money-flow-proxy
- [ ] box-level (TMC) + test
- [ ] cycles + normalize (CHDMx, Tốc độ)
- [ ] indices (DSPI/MPIC/BB-Status/XH-Cầu)
- [ ] signals (Uốn / N-phiên / đảo chiều)
- [ ] compute orchestrator
- [ ] validation script + curve-vs-price sanity ✅ GATE

## Success criteria

- `computeBlackbox(getSeries('HPG'))` returns TMC∈[0,1], CHDMx∈[0,100], correct Uốn flags.
- Matches manual semantics (saturation→reversal, turn=signal).
- Validation shows signal ≠ random noise.

## Risks

- **Proxy ≠ QMV truth.** Label everything `proxy` in output + UI. This gate decides whether to buy real data.
- Anchor non-stationarity → always store raw `box[]`, never the normalized value.
- Look-ahead bias in normalization → use only data ≤ t.

## Next

01 ‖ 02 (UI shell). Converge: screener reads `BlackboxResult` columns.
