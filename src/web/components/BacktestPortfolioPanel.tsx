import { useState } from "react";
import type { Timeframe } from "../../shared/types.js";

interface PortfolioResult {
  perSymbol: Array<{
    symbol: string;
    candleCount: number;
    stats: {
      total: number;
      wins: number;
      losses: number;
      winRate: number;
      avgR: number;
      sumR: number;
      pnlPct: number;
      maxDrawdownPct: number;
      totalFees: number;
    };
  }>;
  aggregate: {
    totalSymbols: number;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgR: number;
    sumR: number;
    totalFees: number;
    startingBalance: number;
    finalBalance: number;
    pnlPct: number;
    maxDrawdownPct: number;
    bestSymbol: string | null;
    worstSymbol: string | null;
  };
  equity: Array<{ time: number; balance: number }>;
  error?: string;
}

const VN30 = [
  "VCB",
  "BID",
  "CTG",
  "HPG",
  "VHM",
  "VIC",
  "MWG",
  "MSN",
  "FPT",
  "TCB",
  "ACB",
  "GAS",
  "POW",
  "SAB",
  "SSI",
  "STB",
  "TPB",
  "VPB",
  "VNM",
  "VRE",
];
const VN_TIMEFRAMES: Timeframe[] = ["1d", "1h"];

/**
 * Multi-symbol portfolio backtest. User picks N symbols (subset of VN30 +
 * custom), gets per-symbol breakdown + merged aggregate stats + equity curve.
 */
export function BacktestPortfolioPanel({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const show = embedded || open;
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["VCB", "HPG", "FPT", "MWG", "VHM"]),
  );
  const [custom, setCustom] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [startingBalance, setStartingBalance] = useState("100000");
  const [riskPct, setRiskPct] = useState("1");
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [vnSessionFilter, setVnSessionFilter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PortfolioResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (s: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  const addCustom = () => {
    const v = custom.trim().toUpperCase();
    if (!v) return;
    setSelected((p) => new Set([...p, v]));
    setCustom("");
  };

  const symbols = [...selected];

  const run = async () => {
    if (symbols.length === 0) {
      setError("Select at least 1 symbol");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backtest/vn/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          timeframe,
          fromDate,
          toDate,
          startingBalance: Number(startingBalance),
          base: {
            slMode: "trigger-wick",
            tpMode: "next-resistance",
            riskPct: Number(riskPct),
            preferredOnly,
            vnSessionFilter,
            feeBps: 15,
            sellTaxBps: 10,
            lotSize: 100,
            settlementBars: timeframe === "1d" ? 3 : 0,
          },
        }),
      });
      const json = (await res.json()) as PortfolioResult;
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
          🧺 Portfolio {open ? "▾" : "▸"}
        </button>
      )}
      {show && (
        <div style={embedded ? embeddedPanelStyle : panelStyle}>
          <div style={hdrStyle}>
            Multi-symbol portfolio · equal-weight slice
          </div>

          <div style={sectStyle}>
            <div style={{ fontSize: 10, color: "#8b949e", marginBottom: 4 }}>
              VN30 tickers ({selected.size} selected):
            </div>
            <div style={chipWrapStyle}>
              {VN30.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(s)}
                  style={{
                    ...chipStyle,
                    ...(selected.has(s) ? chipSelStyle : {}),
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input
                type="text"
                placeholder="Add custom (e.g. SSB)"
                value={custom}
                onChange={(e) => setCustom(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
                style={{ ...inputStyle, flex: 1, width: "auto" }}
              />
              <button type="button" onClick={addCustom} style={smallBtnStyle}>
                + Add
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                style={smallBtnStyle}
              >
                Clear
              </button>
            </div>
          </div>

          <div style={sectStyle}>
            <div style={rowStyle}>
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
              <Field label="Capital $">
                <input
                  type="number"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  style={{ ...inputStyle, width: 80 }}
                />
              </Field>
              <Field label="Risk %">
                <input
                  type="number"
                  step="any"
                  value={riskPct}
                  onChange={(e) => setRiskPct(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ ...rowStyle, gap: 12 }}>
              <CheckField
                label="Preferred only (★ wave-5)"
                checked={preferredOnly}
                onChange={setPreferredOnly}
              />
              <CheckField
                label="VN session filter"
                checked={vnSessionFilter}
                onChange={setVnSessionFilter}
              />
              <button
                type="button"
                onClick={run}
                disabled={busy || symbols.length === 0}
                style={runBtnStyle}
              >
                {busy
                  ? `Fetching ${symbols.length} symbols…`
                  : `▶ Run ${symbols.length} symbols`}
              </button>
            </div>
          </div>

          {error && <div style={errStyle}>{error}</div>}

          {result && (
            <div style={sectStyle}>
              <div style={aggGridStyle}>
                <Stat
                  label="Symbols"
                  value={String(result.aggregate.totalSymbols)}
                />
                <Stat
                  label="Trades"
                  value={String(result.aggregate.totalTrades)}
                />
                <Stat
                  label="Win%"
                  value={`${(result.aggregate.winRate * 100).toFixed(1)}`}
                  color={
                    result.aggregate.winRate >= 0.5 ? "#26a69a" : "#ef5350"
                  }
                />
                <Stat
                  label="AvgR"
                  value={result.aggregate.avgR.toFixed(2)}
                  color={result.aggregate.avgR >= 0 ? "#26a69a" : "#ef5350"}
                />
                <Stat
                  label="SumR"
                  value={result.aggregate.sumR.toFixed(1)}
                  color={result.aggregate.sumR >= 0 ? "#26a69a" : "#ef5350"}
                />
                <Stat
                  label="PnL%"
                  value={`${result.aggregate.pnlPct >= 0 ? "+" : ""}${result.aggregate.pnlPct.toFixed(1)}`}
                  color={result.aggregate.pnlPct >= 0 ? "#26a69a" : "#ef5350"}
                />
                <Stat
                  label="DD%"
                  value={result.aggregate.maxDrawdownPct.toFixed(1)}
                  color="#ef5350"
                />
                <Stat
                  label="Fees$"
                  value={result.aggregate.totalFees.toFixed(0)}
                />
              </div>
              <div style={{ fontSize: 10, color: "#8b949e", margin: "4px 0" }}>
                Best:{" "}
                <span style={{ color: "#26a69a" }}>
                  {result.aggregate.bestSymbol}
                </span>
                &nbsp;· Worst:{" "}
                <span style={{ color: "#ef5350" }}>
                  {result.aggregate.worstSymbol}
                </span>
                &nbsp;· Final ${result.aggregate.finalBalance.toFixed(0)}
              </div>

              <EquityLine equity={result.equity} />

              <div
                style={{
                  fontSize: 9,
                  color: "#8b949e",
                  textTransform: "uppercase",
                  marginTop: 8,
                  marginBottom: 2,
                }}
              >
                Per-symbol breakdown
              </div>
              <div style={tblHdrStyle}>
                <span>Symbol</span>
                <span>Bars</span>
                <span>N</span>
                <span>Win%</span>
                <span>AvgR</span>
                <span>SumR</span>
                <span>PnL%</span>
                <span>DD%</span>
                <span>Fees$</span>
              </div>
              {[...result.perSymbol]
                .sort((a, b) => b.stats.sumR - a.stats.sumR)
                .map((s) => (
                  <div key={s.symbol} style={tblRowStyle}>
                    <span style={{ fontWeight: 700 }}>{s.symbol}</span>
                    <span style={{ color: "#8b949e" }}>{s.candleCount}</span>
                    <span>{s.stats.total}</span>
                    <span
                      style={{
                        color: s.stats.winRate >= 0.5 ? "#26a69a" : "#ef5350",
                      }}
                    >
                      {(s.stats.winRate * 100).toFixed(0)}
                    </span>
                    <span
                      style={{
                        color: s.stats.avgR >= 0 ? "#26a69a" : "#ef5350",
                      }}
                    >
                      {s.stats.avgR.toFixed(2)}
                    </span>
                    <span
                      style={{
                        color: s.stats.sumR >= 0 ? "#26a69a" : "#ef5350",
                      }}
                    >
                      {s.stats.sumR.toFixed(1)}
                    </span>
                    <span
                      style={{
                        color: s.stats.pnlPct >= 0 ? "#26a69a" : "#ef5350",
                      }}
                    >
                      {s.stats.pnlPct >= 0 ? "+" : ""}
                      {s.stats.pnlPct.toFixed(1)}
                    </span>
                    <span style={{ color: "#ef5350" }}>
                      {s.stats.maxDrawdownPct.toFixed(1)}
                    </span>
                    <span style={{ color: "#8b949e" }}>
                      {s.stats.totalFees.toFixed(0)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EquityLine({ equity }: { equity: Array<{ balance: number }> }) {
  if (equity.length < 2) return null;
  const w = 700,
    h = 80;
  const xs = equity.map((_, i) => (i / (equity.length - 1)) * w);
  const min = Math.min(...equity.map((e) => e.balance));
  const max = Math.max(...equity.map((e) => e.balance));
  const range = max - min || 1;
  const pts = equity
    .map((e, i) => `${xs[i]},${h - ((e.balance - min) / range) * (h - 4) - 2}`)
    .join(" ");
  const positive = equity[equity.length - 1].balance >= equity[0].balance;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      style={{
        marginTop: 6,
        background: "#161b22",
        borderRadius: 3,
        display: "block",
      }}
    >
      <polyline
        fill="none"
        stroke={positive ? "#26a69a" : "#ef5350"}
        strokeWidth={1.5}
        points={pts}
      />
    </svg>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
    >
      <span
        style={{ fontSize: 9, color: "#8b949e", textTransform: "uppercase" }}
      >
        {label}
      </span>
      <span
        style={{ fontSize: 13, fontWeight: 700, color: color ?? "#c9d1d9" }}
      >
        {value}
      </span>
    </div>
  );
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

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        color: "#8b949e",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
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
  width: 760,
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  boxShadow: "0 -4px 16px rgba(0,0,0,0.5)",
  zIndex: 60,
  fontSize: 11,
  color: "#c9d1d9",
  maxHeight: "80vh",
  overflowY: "auto",
};
const hdrStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "#161b22",
  borderBottom: "1px solid #30363d",
  fontSize: 11,
  color: "#c9d1d9",
};
const sectStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #161b22",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-end",
  flexWrap: "wrap",
  marginBottom: 6,
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
const smallBtnStyle: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 10,
  background: "#0d1117",
  color: "#8b949e",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
};
const chipWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 3,
};
const chipStyle: React.CSSProperties = {
  padding: "2px 6px",
  fontSize: 10,
  background: "#161b22",
  color: "#8b949e",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
};
const chipSelStyle: React.CSSProperties = {
  background: "#1f6feb",
  color: "#fff",
  borderColor: "#1f6feb",
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
const aggGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(8, 1fr)",
  gap: 4,
  background: "#161b22",
  borderRadius: 3,
  padding: "8px 4px",
};
const tblHdrStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "70px 50px 40px 50px 50px 50px 60px 50px 60px",
  gap: 6,
  padding: "4px 6px",
  fontSize: 9,
  color: "#8b949e",
  textTransform: "uppercase",
  borderBottom: "1px solid #21262d",
};
const tblRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "70px 50px 40px 50px 50px 50px 60px 50px 60px",
  gap: 6,
  padding: "3px 6px",
  fontSize: 10,
  fontFamily: "ui-monospace, monospace",
  borderBottom: "1px solid #161b22",
};
