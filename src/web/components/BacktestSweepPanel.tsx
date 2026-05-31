import { useState } from "react";
import type { Timeframe } from "../../shared/types.js";

interface Stats {
  total: number;
  winRate: number;
  avgR: number;
  sumR: number;
  pnlPct: number;
  maxDrawdownPct: number;
}

interface SweepCell {
  params: Record<string, number | boolean | string>;
  inSample: Stats | null;
  outOfSample: Stats | null;
  full: Stats | null;
}

interface SweepResponse {
  cells: SweepCell[];
  walkForwardSplit: number | null;
  bestCellIdx: number;
  axes: Array<{ key: string; values: Array<number | boolean | string> }>;
  error?: string;
}

const PRESETS = [
  {
    id: "sl-tp-buffer",
    label: "SL buffer × TP buffer",
    axes: [
      { key: "slBufferAtr", values: [0.05, 0.1, 0.2, 0.3] },
      { key: "tpBufferAtr", values: [0.05, 0.1, 0.2, 0.3] },
    ],
  },
  {
    id: "rr-maxbars",
    label: "R:R × max bars",
    axes: [
      { key: "rrTarget", values: [1.5, 2, 2.5, 3] },
      { key: "maxBars", values: [15, 30, 60, 120] },
    ],
  },
  {
    id: "gating",
    label: "MTF trend × HTF zone × preferred",
    axes: [
      { key: "mtfTrendAlign", values: [false, true] },
      { key: "mtfZoneConfluence", values: [false, true] },
      { key: "preferredOnly", values: [false, true] },
    ],
  },
];

const VN_TIMEFRAMES: Timeframe[] = ["1d", "1h", "15m"];

export function BacktestSweepPanel({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const show = embedded || open;
  const [symbol, setSymbol] = useState("VN30F1M");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [walkForward, setWalkForward] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SweepResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backtest/vn/sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe,
          fromDate,
          toDate,
          base: {
            slMode: "trigger-wick",
            tpMode: "next-resistance",
            riskPct: 1,
            startingBalance: 10_000,
          },
          axes: preset.axes,
          walkForwardSplit: walkForward ? 0.7 : null,
        }),
      });
      const json = (await res.json()) as SweepResponse;
      if (json.error) {
        setError(json.error);
        return;
      }
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      {!embedded && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ ...headerBtnStyle, ...(open ? activeBtnStyle : {}) }}
        >
          🔬 Param Sweep {open ? "▾" : "▸"}
        </button>
      )}
      {show && (
        <div style={embedded ? embeddedPanelStyle : panelStyle}>
          <div style={headerRowStyle}>
            Grid search · walk-forward overfit detector
          </div>

          <div style={rowStyle}>
            <Field label="Symbol">
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                style={{ ...inputStyle, width: 80 }}
              />
            </Field>
            <Field label="Timeframe">
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                style={selectStyle}
              >
                {VN_TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={rowStyle}>
            <Field label="Preset">
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
                style={{ ...selectStyle, minWidth: 200 }}
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({cellCount(p.axes)} cells)
                  </option>
                ))}
              </select>
            </Field>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "#8b949e",
              }}
            >
              <input
                type="checkbox"
                checked={walkForward}
                onChange={(e) => setWalkForward(e.target.checked)}
              />
              Walk-forward 70/30
            </label>
            <button
              type="button"
              onClick={run}
              disabled={busy}
              style={runBtnStyle}
            >
              {busy ? `Running ${cellCount(preset.axes)} cells…` : `▶ Sweep`}
            </button>
          </div>

          {error && <div style={errStyle}>{error}</div>}

          {result && <SweepGrid result={result} />}
        </div>
      )}
    </div>
  );
}

function SweepGrid({ result }: { result: SweepResponse }) {
  const split = result.walkForwardSplit;
  const best = result.cells[result.bestCellIdx];
  const colorize = (s: number | undefined): string => {
    if (s == null) return "#8b949e";
    if (s > 3) return "#26a69a";
    if (s > 0) return "#7fb377";
    if (s > -2) return "#f0b132";
    return "#ef5350";
  };
  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontSize: 11, color: "#c9d1d9", marginBottom: 6 }}>
        {result.cells.length} cells · best: <b>{describe(best.params)}</b>
        &nbsp;→ {fmtStats(best.outOfSample ?? best.full)}
      </div>

      <div style={cellGridStyle}>
        <div style={cellHeaderStyle}>Params</div>
        {split != null && (
          <>
            <div style={cellHeaderStyle}>In-sample</div>
            <div style={cellHeaderStyle}>Out-of-sample</div>
            <div style={cellHeaderStyle}>Δ overfit</div>
          </>
        )}
        {split == null && (
          <>
            <div style={cellHeaderStyle}>Stats</div>
            <div />
            <div />
          </>
        )}

        {result.cells.map((c, i) => {
          const inS = c.inSample;
          const oos = c.outOfSample;
          const full = c.full;
          const isBest = i === result.bestCellIdx;
          const overfit = inS && oos ? inS.sumR - oos.sumR : null;
          return (
            <div key={i} style={{ display: "contents" }}>
              <div
                style={{
                  ...cellRowStyle,
                  color: isBest ? "#f0b132" : "#c9d1d9",
                }}
              >
                {describe(c.params)}
                {isBest ? " ★" : ""}
              </div>
              {split != null ? (
                <>
                  <div style={{ ...cellRowStyle, color: colorize(inS?.sumR) }}>
                    {fmtStats(inS)}
                  </div>
                  <div style={{ ...cellRowStyle, color: colorize(oos?.sumR) }}>
                    {fmtStats(oos)}
                  </div>
                  <div
                    style={{
                      ...cellRowStyle,
                      color:
                        overfit != null && overfit > 2 ? "#ef5350" : "#8b949e",
                    }}
                  >
                    {overfit != null
                      ? `${overfit > 0 ? "+" : ""}${overfit.toFixed(1)}R`
                      : "–"}
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      ...cellRowStyle,
                      color: colorize(full?.sumR),
                      gridColumn: "span 3",
                    }}
                  >
                    {fmtStats(full)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 9, color: "#6e7681", marginTop: 6 }}>
        Δ overfit &gt; 2R suggests config is fit to training period. Prefer high
        OOS sumR, low Δ.
      </div>
    </div>
  );
}

function cellCount(axes: Array<{ values: unknown[] }>): number {
  return axes.reduce((n, a) => n * a.values.length, 1);
}

function describe(p: Record<string, number | boolean | string>): string {
  return Object.entries(p)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

function fmtStats(s: Stats | null): string {
  if (!s || s.total === 0) return "no trades";
  return `${s.total}T · ${(s.winRate * 100).toFixed(0)}% · ${s.sumR.toFixed(1)}R · DD ${s.maxDrawdownPct.toFixed(0)}%`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontSize: 10,
        color: "#8b949e",
      }}
    >
      {label}
      {children}
    </label>
  );
}

const headerBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 11,
  fontFamily: "inherit",
  background: "#161b22",
  color: "#8b949e",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
};
const activeBtnStyle: React.CSSProperties = {
  background: "#1f2937",
  color: "#c9d1d9",
  borderColor: "#388bfd",
};
// Inline variant when hosted inside the Backtest drawer.
const embeddedPanelStyle: React.CSSProperties = {
  position: "static",
  width: "100%",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  fontSize: 11,
  color: "#c9d1d9",
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "100%",
  left: 0,
  marginBottom: 4,
  width: 720,
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  boxShadow: "0 -4px 16px rgba(0,0,0,0.5)",
  zIndex: 60,
  fontSize: 11,
  color: "#c9d1d9",
  maxHeight: "75vh",
  overflowY: "auto",
};
const headerRowStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "#161b22",
  borderBottom: "1px solid #30363d",
  fontSize: 11,
  color: "#c9d1d9",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "8px 12px",
  alignItems: "flex-end",
  flexWrap: "wrap",
};
const inputStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 4px",
  background: "#161b22",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
  width: 100,
};
const selectStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 4px",
  background: "#161b22",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
};
const runBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 11,
  background: "#1f6feb",
  color: "#fff",
  border: "none",
  borderRadius: 3,
  cursor: "pointer",
  marginLeft: "auto",
};
const errStyle: React.CSSProperties = {
  margin: "0 12px 8px",
  padding: "6px 8px",
  background: "#2d1b1b",
  border: "1px solid #f8514926",
  borderRadius: 3,
  color: "#ef5350",
  fontSize: 11,
};
const cellGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr 1fr 80px",
  gap: "2px 8px",
  fontSize: 10,
  fontFamily: "ui-monospace, monospace",
};
const cellHeaderStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#8b949e",
  borderBottom: "1px solid #21262d",
  padding: "4px 0",
  textTransform: "uppercase",
  fontSize: 9,
};
const cellRowStyle: React.CSSProperties = {
  padding: "3px 0",
  borderBottom: "1px solid #161b22",
};
