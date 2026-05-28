# Blackbox Canonical Math (single source of truth)

Derived from QMV V6 manual. All phases reference this. Formulas are our **OHLCV-proxy** interpretation; mark `[PROXY]` where it diverges from QMV's tick-level truth.

## Inputs (per symbol, per day)

```
DM_daily[t]  = net money INTO box that day      (cầu)
DS_daily[t]  = net shares distributed that day    (cung)
```

### [PROXY] OHLCV derivation (no paid data)

```
# daily signed money flow proxy
DM_daily[t] = sign(close[t] − close[t−1]) × close[t] × volume[t]

# shares-out proxy: distribution = volume on down/upper-wick days
# approximate net distribution via close position in range
clv[t]      = ((close−low) − (high−close)) / (high−low)      # close location value, −1..+1
DS_daily[t] = (1 − clv[t]) / 2 × volume[t]                    # more shares "out" when close weak

# recent ~60d: refine DM with intraday signed volume (uptick − downtick) if 1m bars available
```

> Cáo/Sói/Thỏ (order-size split) NOT derivable from OHLCV — needs tick. Leave as future (paid).

## Layer 1 — Box level (anchor-from-foundation, the "Mặc định" 0-1)

```
anchor       = 2021-03-20
box[t]       = Σ (DM_daily − w·DS_daily)  from anchor..t      # w = demand weight ≥ 1 (QMV weights cầu>cung)
TMC[t]       = (box[t] − min(box[anchor..t])) / (max − min)   # → 0..1   (TMC in UI)
TMA20[t]     = SMA(TMC, 20)
TMA50[t]     = SMA(TMC, 50)
```

- High TMC (→1) = box full = **bão hòa** (saturated, money about to leave = risk).
- Low TMC (→0) = box empty = **hấp dẫn** (about to refill = opportunity).
- **Non-stationary:** new all-time extreme rescales whole history → store raw `box[]`, derive TMC on read.

## Layer 2 — Cycle series (windowed, the DMx/DSx)

```
cycles = [3, 5, 10, 20, 50, 200]            # T+, week, 2wk, month, quarter, year
DMx[t] = Σ DM_daily over last x days        # "Mặc định" raw (centered ~0)
DSx[t] = Σ DS_daily over last x days
Tốc độ_x[t] = DMx[t] − DSx[t]               # EM/speed: money vs shares spread
            # green if >0 (accumulation, cầu winning), orange if <0 (distribution)
```

## Layer 3 — Normalized cycle (50-session 0-100, the "Chuẩn hóa" / Uốn signals)

```
CHDMx[t] = 100 × (DMx[t] − min(DMx[t−49..t])) / (max−min)    # → 0..100
CHDSx[t] = 100 × (DSx[t] − min(DSx[t−49..t])) / (max−min)
```

### Signals (read off CHDMx)

```
Uốn lên 20  : CHDM03 (or 05) < 20  AND  slope flips up (CHDMx[t] > CHDMx[t−1] after falling)
Uốn lên 30  : same, threshold 30
Uốn xuống 70: CHDMx > 70  AND  slope flips down
Uốn xuống 80: same, threshold 80
  # zone = context; the TURN (uốn) = the trigger. Manual p16.

Cơ hội T+   : CHDM03 AND CHDM05 both uốn lên from <20
Cơ hội T++  : + CHDM10 uốn lên
Theo sóng   : + CHDM20/50 uốn lên   (more cycles low+turning = higher confidence)

Tiền vào hôm nay   : DM_daily[t] > 0
Tiền vào 2/3 phiên : DM_daily > 0 for last 2 / 3 consecutive days
Tiền ra ...        : mirror with DM_daily < 0
Đảo chiều tăng T+  : DM03 crosses 0 upward (was out, now in, T+ window)
Đảo chiều giảm T+  : DM03 crosses 0 downward
```

## Layer 4 — Forecast indices

```
# Chu kỳ cung cầu (demand-supply cycle), normalized −1..+1, 0 neutral
DSPI[t]     = tanh( k × (DMx_blend − DSx_blend) )    # >0 cầu>cung;  blend over ~20d
DSPIMA5/20  = SMA(DSPI, 5/20)

# Sức ép thị trường (market pressure), 0-100 composite
MPIC[t]     = 100 × normalize( breadth_of_money_in × |DSPI| × TMC_slope )

# BB-Status (money state) — from TMC vs its MAs
  Tiền khỏe  : TMC > TMA20 > TMA50, rising
  Bão hòa    : TMC high (>~0.7) AND slope flattening/turning down
  Tiền yếu   : TMC < TMA20 < TMA50, falling
  Duy trì    : TMC low but slope flattening (about to turn up)   # preferred over Bão hòa

# Chu kỳ cung cầu state (XH Cầu) — from DSPI level+slope
  Cầu khỏe / Bão hòa / Cầu yếu / Duy trì     (same logic on DSPI)

# Dự báo (forecast): transition flags when state about to flip
  Dấu hiệu vào / Đang vào / Xu hướng vào  (and ra mirror)
```

## Layer 5 — Breadth (market/sector "lan tỏa", the BB)

```
BB_breadth[scope] = % of symbols in scope with DM_daily > 0       # lan tỏa
TM[scope]         = Σ box[] across scope, anchor-normalized       # total money (market/sector)
TS[scope]         = Σ shares-out, anchor-normalized
```

## Composite ★ rating (screener, "Mức độ phù hợp trading")

```
score = weighted sum of:
  + Uốn lên (T+/T++/sóng)        (strong)
  + Tиền vào N phiên             (medium)
  + Tốc độ_x > 0                 (medium)
  + Bullish Pattern/Signal (TA)  (medium)
  + TMC in hấp dẫn + turning up   (strong)
  + BB-Status duy trì/khỏe       (context)
  − mirror bearish terms
★ = bucket(score) → 1..5
```

## Validation gate (before trusting / buying data)

On 3-5 liquid symbols (HPG, VCB, FPT…): compute TMC + Uốn signals from OHLCV proxy, overlay on price. Sanity: does hấp dẫn+uốn-lên precede up-moves more than chance? If proxy curve is noise → revisit before investing in UI/data.

### GATE RESULT — 2026-05-28 (FAILED as predictive)

`scripts/validate-blackbox.ts` on HPG/VCB/FPT/MWG/SSI, 1400 daily bars. Edge = signal avg fwd-return − baseline:

```
baseline fwd:        3d=0.27%  5d=0.45%  10d=0.90%
uon-c3-30            3d -0.15  5d -0.16  10d -0.21   (worse than chance)
uon-c3-20            3d -0.06  5d -0.08  10d -0.20
uon-c20-30           3d -0.25  5d -0.30  10d -0.51
conf-c3&c5&c10       3d -0.21  5d -0.34  10d -0.36
uon-c5-30 + DSPI>0   3d +0.18  5d +0.32  10d +0.02   (only positive; faint, T+ horizon)
```

**Conclusion (empirical, sticky):** OHLCV signed-flow proxy does NOT carry QMV's edge. Diagnosed: (1) cumulative box drifts (TMC pins 0/0.94, not oscillating); (2) Uốn fires ~18% of bars (no selectivity); (3) only `DSPI>0` context gives a faint short-horizon edge. QMV's edge needs tick-level active + foreign flow (paid) — as data-moat analysis predicted.

**DECISION (user, 2026-05-28):** Blackbox = **display-only / experimental**, NOT predictive ranking input. Screener ★ built on **proven TA** (patterns/zones/RSI/volume-spike). Revisit blackbox-as-signal only after spiking real paid flow data + re-passing this gate.
