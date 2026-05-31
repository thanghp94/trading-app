# Phase 01 — New Indicators

## Overview
- Priority: P0 (blocks engine).
- Status: ☐ not started.
- 4 new pure indicator functions, mirror existing style (return `number[]` aligned to
  candles, NaN until warmup). Files under `src/shared/indicators/`.

## Existing style to match
- `rsi(candles, period=14): number[]` — Wilder smoothing, NaN first `period` bars.
- `bollinger(candles, period=20, mult=2): {upper, middle, lower}`.
- `ema(candles, period): number[]`.
- `volumeSma(candles, period): number[]` (impulse-detector.ts).
- Candle shape: `{ time, open, high, low, close, volume, closed? }` (src/shared/types.ts:5).

## Files to create
1. `src/shared/indicators/macd.ts`
   - `macd(candles, fast=12, slow=26, signal=9): { macd: number[]; signal: number[]; histogram: number[] }`
   - macd = EMA(fast) − EMA(slow); signal = EMA(macd, 9); histogram = macd − signal.
   - Reuse `ema` on a synthetic close series OR inline EMA over the macd line.
2. `src/shared/indicators/parabolic-sar.ts`
   - `parabolicSar(candles, step=0.02, max=0.2): number[]` (SAR price per bar) +
     optionally `{ sar: number[]; trend: ('up'|'down')[] }`.
   - Standard Wilder PSAR: AF accel, EP tracking, flip on penetration.
3. `src/shared/indicators/dmi.ts`
   - `dmi(candles, period=14): { plusDI: number[]; minusDI: number[]; adx: number[] }`
   - Wilder: +DM/−DM, TR, smoothed, DI = 100×smoothedDM/ATR, DX, ADX = EMA(DX).
4. `src/shared/indicators/stochastic-rsi.ts`
   - `stochasticRsi(candles, rsiPeriod=14, stochPeriod=14, k=3, d=3): { k: number[]; d: number[] }`
   - StochRSI = (RSI − min(RSI,n)) / (max(RSI,n) − min(RSI,n)); %K = SMA(stoch,k); %D = SMA(%K,d). Reuse `rsi`.

## Implementation notes
- Pure, no I/O. Keep each file < 120 lines.
- Guard div-by-zero (flat windows) → NaN or carry-forward, never Infinity.
- Index alignment: output[i] uses only candles[0..i] (no lookahead) — critical, engine relies on it.

## Todo
- [ ] macd.ts
- [ ] parabolic-sar.ts
- [ ] dmi.ts
- [ ] stochastic-rsi.ts
- [ ] tsc compile clean

## Success criteria
- Each returns array length === candles.length, NaN warmup region only.
- Spot-check vs known values (e.g. MACD on a ramp series) in a scratch test.
- No lookahead: output[i] unchanged when candles[i+1..] appended.

## Risks
- PSAR + ADX are the error-prone ones (state machines). Mitigate: port from a
  reference impl, verify trend flips on a synthetic V-shape series.
