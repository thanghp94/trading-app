import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, Timeframe } from "../../shared/types.js";
import { MiniBacktestChart, type MiniTrade } from "./MiniBacktestChart.js";
import { BACKTEST_PRESETS, type Preset } from "./backtest-presets.js";
import { Help } from "./glossary.js";
import {
  buildPlainSummary,
  computeRiskOfRuin,
  wilsonCi,
} from "./risk-of-ruin.js";

interface BacktestResult {
  symbol: string;
  timeframe: string;
  candles?: Candle[];
  trades: Array<{
    entryIdx: number;
    exitIdx: number;
    entry: number;
    exit: number;
    sl: number;
    tp: number;
    rMultiple: number;
    outcome: "win" | "loss" | "breakeven" | "time-stop";
    pnlAbs: number;
    balanceAfter: number;
    feesPaid: number;
    shares: number;
    grossPnl: number;
    beMoved: boolean;
    partialTaken: boolean;
    trailedOut: boolean;
  }>;
  equity: Array<{ time: number; balance: number }>;
  stats: {
    total: number;
    wins: number;
    losses: number;
    breakeven: number;
    timeStops: number;
    winRate: number;
    avgR: number;
    bestR: number;
    worstR: number;
    sumR: number;
    maxDrawdownPct: number;
    finalBalance: number;
    pnlPct: number;
    totalFees: number;
    skippedNoCapital: number;
    perRule: Array<{
      rule: string;
      total: number;
      wins: number;
      losses: number;
      winRate: number;
      sumR: number;
      avgR: number;
      pnlAbs: number;
    }>;
  };
  instrumentClass?: "vn-equity" | "vn-future";
  appliedDefaults?: {
    feeBps: number;
    sellTaxBps: number;
    lotSize: number;
    settlementBars: number;
  } | null;
}

const VN_TIMEFRAMES: Timeframe[] = ["1d", "1h", "15m", "5m"];
const POPULAR_SYMBOLS = [
  "VN30F1M",
  "HPG",
  "VCB",
  "FPT",
  "VHM",
  "MWG",
  "TCB",
  "VIC",
  "MSN",
  "ACB",
];

export function VnBacktestPanel({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const show = embedded || open;
  const [symbol, setSymbol] = useState("VN30F1M");
  const [customSymbol, setCustomSymbol] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [slMode, setSlMode] = useState<"pct" | "trigger-wick">("trigger-wick");
  const [tpMode, setTpMode] = useState<"rr" | "next-resistance">(
    "next-resistance",
  );
  const [slPct, setSlPct] = useState("0.5");
  const [rrTarget, setRrTarget] = useState("2");
  const [maxBars, setMaxBars] = useState("30");
  const [riskPct, setRiskPct] = useState("1");
  const [startingBalance, setStartingBalance] = useState("10000");
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [mtfTrendAlign, setMtfTrendAlign] = useState(false);
  const [mtfZoneConfluence, setMtfZoneConfluence] = useState(false);
  // Realism pack
  const [useVnDefaults, setUseVnDefaults] = useState(true);
  const [feeBps, setFeeBps] = useState("15");
  const [sellTaxBps, setSellTaxBps] = useState("10");
  const [lotSize, setLotSize] = useState("100");
  const [settlementBars, setSettlementBars] = useState("3");
  const [vnSessionFilter, setVnSessionFilter] = useState(true);
  // Active trade management
  const [breakevenAtR, setBreakevenAtR] = useState("0");
  const [partialAtR, setPartialAtR] = useState("0");
  const [partialPct, setPartialPct] = useState("0.5");
  const [trailAtrMult, setTrailAtrMult] = useState("0");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "trades" | "chart">(
    "chart",
  );

  const effectiveSymbol = customSymbol.trim().toUpperCase() || symbol;

  const applyPreset = (p: Preset) => {
    setSlMode(p.config.slMode);
    setTpMode(p.config.tpMode);
    setSlPct(p.config.slPct);
    setRrTarget(p.config.rrTarget);
    setMaxBars(p.config.maxBars);
    setRiskPct(p.config.riskPct);
    setPreferredOnly(p.config.preferredOnly);
    setMtfTrendAlign(p.config.mtfTrendAlign);
    setMtfZoneConfluence(p.config.mtfZoneConfluence);
    setVnSessionFilter(p.config.vnSessionFilter);
    setBreakevenAtR(p.config.breakevenAtR);
    setPartialAtR(p.config.partialAtR);
    setPartialPct(p.config.partialPct);
    setTrailAtrMult(p.config.trailAtrMult);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backtest/vn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: effectiveSymbol,
          timeframe,
          fromDate,
          toDate,
          slMode,
          slPct: Number(slPct) / 100,
          tpMode,
          rrTarget: Number(rrTarget),
          maxBars: Number(maxBars),
          riskPct: Number(riskPct),
          startingBalance: Number(startingBalance),
          preferredOnly,
          mtfTrendAlign,
          mtfZoneConfluence,
          useVnDefaults,
          feeBps: Number(feeBps),
          sellTaxBps: Number(sellTaxBps),
          lotSize: Number(lotSize),
          settlementBars: Number(settlementBars),
          vnSessionFilter,
          breakevenAtR: Number(breakevenAtR),
          partialAtR: Number(partialAtR),
          partialPct: Number(partialPct),
          trailAtrMult: Number(trailAtrMult),
        }),
      });
      const json = (await res.json()) as BacktestResult & { error?: string };
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
    <div style={wrapStyle}>
      {!embedded && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ ...headerBtnStyle, ...(open ? activeBtnStyle : {}) }}
        >
          🇻🇳 VN Backtest {open ? "▾" : "▸"}
        </button>
      )}
      {show && (
        <div style={embedded ? embeddedPanelStyle : panelStyle}>
          {/* Strategy presets — novice fast-path */}
          <div
            style={{
              ...sectionStyle,
              background: "#0a0e13",
              borderBottom: "1px solid #21262d",
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#8b949e",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Strategy preset <Help termKey="preferred-only" />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {BACKTEST_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  title={p.description}
                  style={presetBtnStyle}
                >
                  <span style={{ fontSize: 14 }}>{p.badge}</span> {p.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 9, color: "#6e7681", marginTop: 4 }}>
              Click a preset to fill every setting at once. You can still tweak
              after.
            </div>
          </div>

          {/* Symbol + Timeframe */}
          <div style={sectionStyle}>
            <div style={rowStyle}>
              <Field label="Symbol">
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  style={selectStyle}
                >
                  {POPULAR_SYMBOLS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Custom symbol">
                <input
                  type="text"
                  placeholder="e.g. ACB"
                  value={customSymbol}
                  onChange={(e) =>
                    setCustomSymbol(e.target.value.toUpperCase())
                  }
                  style={{ ...inputStyle, width: 70 }}
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
            </div>
            {/* Date range */}
            <div style={rowStyle}>
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
              <Field label="Balance $">
                <input
                  type="number"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  style={{ ...inputStyle, width: 70 }}
                />
              </Field>
            </div>
          </div>

          {/* SL / TP / params */}
          <div style={{ ...sectionStyle, borderTop: "1px solid #21262d" }}>
            <div style={rowStyle}>
              <Field label="SL mode">
                <select
                  value={slMode}
                  onChange={(e) =>
                    setSlMode(e.target.value as "pct" | "trigger-wick")
                  }
                  style={selectStyle}
                >
                  <option value="trigger-wick">Trigger wick ★</option>
                  <option value="pct">Pct of entry</option>
                </select>
              </Field>
              <Field label="TP mode">
                <select
                  value={tpMode}
                  onChange={(e) =>
                    setTpMode(e.target.value as "rr" | "next-resistance")
                  }
                  style={selectStyle}
                >
                  <option value="next-resistance">Next resistance ★</option>
                  <option value="rr">R:R fixed</option>
                </select>
              </Field>
              <Field label={slMode === "pct" ? "SL %" : "SL % (fallback)"}>
                <input
                  type="number"
                  step="any"
                  value={slPct}
                  onChange={(e) => setSlPct(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label={tpMode === "rr" ? "R:R" : "R:R fallback"}>
                <input
                  type="number"
                  step="any"
                  value={rrTarget}
                  onChange={(e) => setRrTarget(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Max bars">
                <input
                  type="number"
                  value={maxBars}
                  onChange={(e) => setMaxBars(e.target.value)}
                  style={inputStyle}
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
                label="MTF trend align"
                checked={mtfTrendAlign}
                onChange={setMtfTrendAlign}
              />
              <CheckField
                label="HTF zone confluence"
                checked={mtfZoneConfluence}
                onChange={setMtfZoneConfluence}
              />
              <CheckField
                label="VN session filter (skip lunch/off-hours)"
                checked={vnSessionFilter}
                onChange={setVnSessionFilter}
              />
            </div>

            {/* Active trade management row */}
            <div
              style={{
                ...rowStyle,
                gap: 8,
                padding: "6px 8px",
                background: "#161b22",
                borderRadius: 3,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: "#8b949e",
                  textTransform: "uppercase",
                  marginRight: 4,
                }}
              >
                Active mgmt
              </span>
              <Field label="BE @ R">
                <input
                  type="number"
                  step="any"
                  value={breakevenAtR}
                  onChange={(e) => setBreakevenAtR(e.target.value)}
                  style={inputStyle}
                  title="0 = disabled"
                />
              </Field>
              <Field label="Partial @ R">
                <input
                  type="number"
                  step="any"
                  value={partialAtR}
                  onChange={(e) => setPartialAtR(e.target.value)}
                  style={inputStyle}
                  title="0 = disabled"
                />
              </Field>
              <Field label="Partial %">
                <input
                  type="number"
                  step="any"
                  value={partialPct}
                  onChange={(e) => setPartialPct(e.target.value)}
                  style={inputStyle}
                  title="Fraction 0-1"
                />
              </Field>
              <Field label="Trail × ATR">
                <input
                  type="number"
                  step="any"
                  value={trailAtrMult}
                  onChange={(e) => setTrailAtrMult(e.target.value)}
                  style={inputStyle}
                  title="0 = disabled; common 2-3"
                />
              </Field>
            </div>

            {/* Realism row */}
            <div
              style={{
                ...rowStyle,
                gap: 8,
                padding: "6px 8px",
                background: "#161b22",
                borderRadius: 3,
              }}
            >
              <CheckField
                label="Auto VN defaults (fees/T+2.5/lots by symbol)"
                checked={useVnDefaults}
                onChange={setUseVnDefaults}
              />
              {!useVnDefaults && (
                <>
                  <Field label="Fee bps">
                    <input
                      type="number"
                      value={feeBps}
                      onChange={(e) => setFeeBps(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="SellTax bps">
                    <input
                      type="number"
                      value={sellTaxBps}
                      onChange={(e) => setSellTaxBps(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Lot size">
                    <input
                      type="number"
                      value={lotSize}
                      onChange={(e) => setLotSize(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="T+ bars">
                    <input
                      type="number"
                      value={settlementBars}
                      onChange={(e) => setSettlementBars(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                </>
              )}
              <button
                type="button"
                onClick={run}
                disabled={busy}
                style={runBtnStyle}
              >
                {busy
                  ? "Fetching DNSE data…"
                  : `▶ Run ${effectiveSymbol} ${timeframe}`}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && <div style={errorStyle}>{error}</div>}

          {/* Results */}
          {result && (
            <div style={{ ...sectionStyle, borderTop: "1px solid #21262d" }}>
              {/* Plain-language summary — first thing novices read */}
              <PlainSummary
                result={result}
                symbol={effectiveSymbol}
                timeframe={timeframe}
                fromDate={fromDate}
                toDate={toDate}
                startingBalance={Number(startingBalance)}
              />

              {/* Sample-size confidence */}
              <SampleConfidence
                wins={result.stats.wins}
                losses={result.stats.losses}
              />

              {/* Risk of ruin */}
              <RiskOfRuinBlock
                trades={result.trades}
                riskPct={Number(riskPct)}
              />

              {/* Summary stats */}
              <div style={statGridStyle}>
                <Stat label="Trades" value={String(result.stats.total)} />
                <Stat
                  label={
                    <>
                      Win rate <Help termKey="win-rate" />
                    </>
                  }
                  value={`${(result.stats.winRate * 100).toFixed(1)}%`}
                  color={result.stats.winRate >= 0.5 ? "#26a69a" : "#ef5350"}
                />
                <Stat
                  label={
                    <>
                      Avg R <Help termKey="avg-r" />
                    </>
                  }
                  value={result.stats.avgR.toFixed(2)}
                  color={result.stats.avgR >= 0 ? "#26a69a" : "#ef5350"}
                />
                <Stat
                  label={
                    <>
                      Sum R <Help termKey="sum-r" />
                    </>
                  }
                  value={result.stats.sumR.toFixed(1)}
                  color={result.stats.sumR >= 0 ? "#26a69a" : "#ef5350"}
                />
                <Stat
                  label={
                    <>
                      Best R <Help termKey="r-multiple" />
                    </>
                  }
                  value={result.stats.bestR.toFixed(2)}
                  color="#26a69a"
                />
                <Stat
                  label="Worst R"
                  value={result.stats.worstR.toFixed(2)}
                  color="#ef5350"
                />
                <Stat
                  label={
                    <>
                      Max DD <Help termKey="max-dd" />
                    </>
                  }
                  value={`${result.stats.maxDrawdownPct.toFixed(1)}%`}
                  color="#ef5350"
                />
                <Stat
                  label="PnL"
                  value={`${result.stats.pnlPct >= 0 ? "+" : ""}${result.stats.pnlPct.toFixed(1)}%`}
                  color={result.stats.pnlPct >= 0 ? "#26a69a" : "#ef5350"}
                />
              </div>
              <div style={{ fontSize: 10, color: "#8b949e", marginTop: 4 }}>
                {result.stats.wins}W · {result.stats.losses}L ·{" "}
                {result.stats.breakeven}BE · {result.stats.timeStops}TS &nbsp;·
                Final ${result.stats.finalBalance.toFixed(0)}
                &nbsp;· Fees ${result.stats.totalFees.toFixed(0)}
                {result.stats.skippedNoCapital > 0 && (
                  <>
                    {" "}
                    &nbsp;·{" "}
                    <span style={{ color: "#f0b132" }}>
                      {result.stats.skippedNoCapital} skipped
                      (under-capitalized)
                    </span>
                  </>
                )}
              </div>
              {result.appliedDefaults && (
                <div style={{ fontSize: 9, color: "#6e7681", marginTop: 2 }}>
                  Applied: {result.instrumentClass} · fee{" "}
                  {result.appliedDefaults.feeBps}bps · sellTax{" "}
                  {result.appliedDefaults.sellTaxBps}bps · lot{" "}
                  {result.appliedDefaults.lotSize} · T+
                  {result.appliedDefaults.settlementBars} bars
                </div>
              )}

              {result.stats.perRule.length > 0 && (
                <div style={perRuleWrapStyle}>
                  <div
                    style={{
                      fontSize: 9,
                      color: "#8b949e",
                      textTransform: "uppercase",
                      marginBottom: 3,
                    }}
                  >
                    Per-rule attribution
                  </div>
                  <div style={perRuleHeaderStyle}>
                    <span>Rule</span>
                    <span>N</span>
                    <span>Win%</span>
                    <span>AvgR</span>
                    <span>SumR</span>
                    <span>PnL$</span>
                  </div>
                  {result.stats.perRule.map((r) => (
                    <div key={r.rule} style={perRuleRowStyle}>
                      <span
                        style={{
                          color:
                            r.rule === "wave-5-entry" ? "#f0b132" : "#c9d1d9",
                        }}
                      >
                        {r.rule === "wave-5-entry" ? "★ " : ""}
                        {r.rule}
                      </span>
                      <span>{r.total}</span>
                      <span
                        style={{
                          color: r.winRate >= 0.5 ? "#26a69a" : "#ef5350",
                        }}
                      >
                        {(r.winRate * 100).toFixed(0)}
                      </span>
                      <span
                        style={{ color: r.avgR >= 0 ? "#26a69a" : "#ef5350" }}
                      >
                        {r.avgR.toFixed(2)}
                      </span>
                      <span
                        style={{ color: r.sumR >= 0 ? "#26a69a" : "#ef5350" }}
                      >
                        {r.sumR.toFixed(1)}
                      </span>
                      <span
                        style={{ color: r.pnlAbs >= 0 ? "#26a69a" : "#ef5350" }}
                      >
                        {r.pnlAbs >= 0 ? "+" : ""}
                        {r.pnlAbs.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <SaveRunButton
                result={result}
                config={{
                  slMode,
                  slPct: Number(slPct) / 100,
                  tpMode,
                  rrTarget: Number(rrTarget),
                  maxBars: Number(maxBars),
                  riskPct: Number(riskPct),
                  preferredOnly,
                  mtfTrendAlign,
                  mtfZoneConfluence,
                  useVnDefaults,
                  feeBps: useVnDefaults
                    ? result.appliedDefaults?.feeBps
                    : Number(feeBps),
                  sellTaxBps: useVnDefaults
                    ? result.appliedDefaults?.sellTaxBps
                    : Number(sellTaxBps),
                  lotSize: useVnDefaults
                    ? result.appliedDefaults?.lotSize
                    : Number(lotSize),
                  settlementBars: useVnDefaults
                    ? result.appliedDefaults?.settlementBars
                    : Number(settlementBars),
                }}
                fromDate={fromDate}
                toDate={toDate}
              />

              <EquitySpark equity={result.equity} />

              {/* Tab switcher: chart / summary / trades */}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {(["chart", "stats", "trades"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTab(t)}
                    style={{
                      ...tabBtnStyle,
                      ...(activeTab === t ? activeTabStyle : {}),
                    }}
                  >
                    {t === "chart"
                      ? `Chart (${result.candles?.length ?? 0} bars)`
                      : t === "stats"
                        ? "Summary"
                        : `Trades (${result.trades.length})`}
                  </button>
                ))}
              </div>
              {activeTab === "chart" &&
                result.candles &&
                result.candles.length > 0 && (
                  <ChartWithReplay
                    candles={result.candles}
                    trades={result.trades as MiniTrade[]}
                  />
                )}
              {activeTab === "chart" &&
                (!result.candles || result.candles.length === 0) && (
                  <div style={{ padding: 12, color: "#ef5350", fontSize: 11 }}>
                    No candles returned from server.
                  </div>
                )}
              {activeTab === "trades" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => exportTradesCsv(result)}
                      style={{
                        ...runBtnStyle,
                        marginLeft: 0,
                        background: "#21262d",
                      }}
                    >
                      ⬇ Export CSV
                    </button>
                  </div>
                  <div style={tradeListStyleWide}>
                    <div style={tradeHeaderStyleWide}>
                      <span>#</span>
                      <span>Entry</span>
                      <span>Exit</span>
                      <span>Sh</span>
                      <span>Outcome</span>
                      <span>R</span>
                      <span>Gross</span>
                      <span>Fees</span>
                      <span>Net</span>
                      <span>Flags</span>
                      <span>Balance</span>
                    </div>
                    {result.trades.map((t, i) => (
                      <div
                        key={i}
                        style={{
                          ...tradeRowStyleWide,
                          background: i % 2 === 0 ? "#0d1117" : "#161b22",
                        }}
                      >
                        <span style={{ color: "#8b949e" }}>{i + 1}</span>
                        <span>{fmt(t.entry)}</span>
                        <span>{fmt(t.exit)}</span>
                        <span style={{ color: "#8b949e" }}>{t.shares}</span>
                        <span style={{ color: outcomeColor(t.outcome) }}>
                          {t.outcome}
                        </span>
                        <span
                          style={{
                            color: t.rMultiple >= 0 ? "#26a69a" : "#ef5350",
                          }}
                        >
                          {t.rMultiple.toFixed(2)}
                        </span>
                        <span
                          style={{
                            color: t.grossPnl >= 0 ? "#26a69a" : "#ef5350",
                          }}
                        >
                          {t.grossPnl.toFixed(0)}
                        </span>
                        <span style={{ color: "#f0b132" }}>
                          −{t.feesPaid.toFixed(0)}
                        </span>
                        <span
                          style={{
                            color: t.pnlAbs >= 0 ? "#26a69a" : "#ef5350",
                          }}
                        >
                          {t.pnlAbs >= 0 ? "+" : ""}
                          {t.pnlAbs.toFixed(0)}
                        </span>
                        <span style={{ color: "#7fb377", fontSize: 9 }}>
                          {t.beMoved ? "BE " : ""}
                          {t.partialTaken ? "P " : ""}
                          {t.trailedOut ? "T" : ""}
                        </span>
                        <span style={{ color: "#8b949e" }}>
                          ${t.balanceAfter.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Replay-aware wrapper around MiniBacktestChart. Lets user "cut" the chart
 * at a chosen historical bar/date and step candles forward one-by-one,
 * or auto-play, to manually backtest entries. Trades whose entry is
 * past the cursor stay hidden — they reveal as the cursor crosses them.
 *
 * Inspired by TradingView Bar Replay.
 */
function ChartWithReplay({
  candles,
  trades,
}: {
  candles: Candle[];
  trades: MiniTrade[];
}) {
  const [enabled, setEnabled] = useState(false);
  const [cursor, setCursor] = useState(() => Math.floor(candles.length * 0.7));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 5 | 10 | 20>(2);
  const intervalRef = useRef<number | null>(null);

  // Reset cursor when candles change (new backtest run).
  useEffect(() => {
    setCursor(Math.floor(candles.length * 0.7));
    setPlaying(false);
    setEnabled(false);
  }, [candles]);

  // Auto-play loop.
  useEffect(() => {
    if (!playing || !enabled) {
      if (intervalRef.current != null)
        window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    const ms = Math.max(50, Math.floor(1000 / speed));
    intervalRef.current = window.setInterval(() => {
      setCursor((c) => {
        if (c >= candles.length) {
          setPlaying(false);
          return candles.length;
        }
        return c + 1;
      });
    }, ms);
    return () => {
      if (intervalRef.current != null)
        window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [playing, enabled, speed, candles.length]);

  const step = (delta: number) =>
    setCursor((c) => Math.max(30, Math.min(candles.length, c + delta)));

  const jumpToDate = (iso: string) => {
    if (!iso) return;
    const ts = Math.floor(new Date(iso).getTime() / 1000);
    // Find first candle whose time >= ts.
    const idx = candles.findIndex((c) => c.time >= ts);
    if (idx >= 0) setCursor(Math.max(30, idx));
  };

  const cursorCandle =
    cursor > 0 && cursor <= candles.length ? candles[cursor - 1] : null;
  const cursorDate = cursorCandle
    ? new Date(cursorCandle.time * 1000)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")
    : "–";
  const visibleTradeCount = trades.filter((t) => t.entryIdx < cursor).length;

  return (
    <div>
      <div style={replayBarStyle}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: "#8b949e",
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setPlaying(false);
            }}
          />
          Replay mode
        </label>
        {enabled && (
          <>
            <button
              type="button"
              onClick={() => step(-50)}
              style={stepBtnStyle}
              title="−50 bars"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => step(-10)}
              style={stepBtnStyle}
              title="−10 bars"
            >
              −10
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              style={stepBtnStyle}
              title="−1 bar"
            >
              −1
            </button>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              style={{
                ...stepBtnStyle,
                background: playing ? "#ef5350" : "#26a69a",
                color: "#fff",
                borderColor: "transparent",
              }}
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              style={stepBtnStyle}
              title="+1 bar"
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => step(10)}
              style={stepBtnStyle}
              title="+10 bars"
            >
              +10
            </button>
            <button
              type="button"
              onClick={() => step(50)}
              style={stepBtnStyle}
              title="+50 bars"
            >
              ⏭
            </button>
            <select
              value={speed}
              onChange={(e) =>
                setSpeed(Number(e.target.value) as 1 | 2 | 5 | 10 | 20)
              }
              style={speedSelectStyle}
              title="Bars per second"
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={5}>5×</option>
              <option value={10}>10×</option>
              <option value={20}>20×</option>
            </select>
            <input
              type="datetime-local"
              onChange={(e) => jumpToDate(e.target.value)}
              style={dateInputStyle}
              title="Jump to date"
            />
            <span style={cursorBadgeStyle}>
              bar <b>{cursor}</b>/{candles.length} · {cursorDate} ·{" "}
              <span style={{ color: "#7fb377" }}>{visibleTradeCount}</span>{" "}
              trades visible
            </span>
          </>
        )}
      </div>
      <MiniBacktestChart
        candles={candles}
        trades={trades}
        height={320}
        cursor={enabled ? cursor : undefined}
      />
      {enabled && (
        <input
          type="range"
          min={30}
          max={candles.length}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
          style={{ width: "100%", marginTop: 4 }}
        />
      )}
    </div>
  );
}

function SaveRunButton({
  result,
  config,
  fromDate,
  toDate,
}: {
  result: BacktestResult;
  config: Record<string, unknown>;
  fromDate: string;
  toDate: string;
}) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/backtest/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || undefined,
          fromDate,
          toDate,
          config,
          result,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setLabel("");
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}
    >
      <input
        type="text"
        placeholder="Run label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={{ ...inputStyle, flex: 1, width: "auto" }}
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{ ...runBtnStyle, marginLeft: 0 }}
      >
        {saving ? "Saving…" : saved ? "✓ Saved" : "💾 Save run"}
      </button>
    </div>
  );
}

function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString("vi-VN") : n.toFixed(2);
}

function outcomeColor(o: string) {
  if (o === "win") return "#26a69a";
  if (o === "loss") return "#ef5350";
  return "#8b949e";
}

function PlainSummary({
  result,
  symbol,
  timeframe,
  fromDate,
  toDate,
  startingBalance,
}: {
  result: BacktestResult;
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  startingBalance: number;
}) {
  const text = buildPlainSummary({
    symbol,
    timeframe,
    fromDate,
    toDate,
    startingBalance,
    total: result.stats.total,
    wins: result.stats.wins,
    losses: result.stats.losses,
    winRate: result.stats.winRate,
    avgR: result.stats.avgR,
    worstR: result.stats.worstR,
    bestR: result.stats.bestR,
    totalFees: result.stats.totalFees,
    finalBalance: result.stats.finalBalance,
    pnlPct: result.stats.pnlPct,
    maxDdPct: result.stats.maxDrawdownPct,
  });
  return (
    <div style={summaryBoxStyle}>
      <div
        style={{
          fontSize: 9,
          color: "#8b949e",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Plain-English summary
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.5, color: "#c9d1d9" }}>
        {text}
      </div>
    </div>
  );
}

function SampleConfidence({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total < 1) return null;
  const [lo, hi] = wilsonCi(wins, total);
  const margin = ((hi - lo) / 2) * 100;
  const verdict = total < 30 ? "🔴 LOW" : total < 100 ? "🟡 MEDIUM" : "🟢 HIGH";
  return (
    <div
      style={{
        fontSize: 10,
        color: "#8b949e",
        marginTop: 6,
        padding: "4px 8px",
        background: "#161b22",
        borderRadius: 3,
      }}
    >
      <b>Sample confidence:</b> {verdict} · 95% CI: {(lo * 100).toFixed(0)}%–
      {(hi * 100).toFixed(0)}% (±{margin.toFixed(0)} pts) &nbsp;
      <Help termKey="win-rate" />
      <div style={{ fontSize: 9, color: "#6e7681" }}>
        With {total} W+L trades, the true long-run win rate could be anywhere in
        this band. Narrower band = more trustworthy.
      </div>
    </div>
  );
}

function RiskOfRuinBlock({
  trades,
  riskPct,
}: {
  trades: BacktestResult["trades"];
  riskPct: number;
}) {
  const ror = useMemo(
    () =>
      computeRiskOfRuin({
        rMultiples: trades.map((t) => t.rMultiple),
        riskPct,
        horizon: 100,
        runs: 1000,
        thresholds: [20, 35, 50],
      }),
    [trades, riskPct],
  );
  if (!ror) return null;
  return (
    <div
      style={{
        fontSize: 10,
        color: "#8b949e",
        marginTop: 6,
        padding: "6px 8px",
        background: "#161b22",
        borderRadius: 3,
      }}
    >
      <b style={{ color: "#c9d1d9" }}>
        Risk of ruin <Help termKey="monte-carlo" />
      </b>
      <div style={{ fontSize: 9, color: "#6e7681", marginBottom: 4 }}>
        Monte Carlo: {ror.runs} simulated runs of {ror.horizon} trades at{" "}
        {riskPct}% risk each, sampling from your historical R-multiples.
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {ror.thresholds.map((t) => (
          <span key={t.ddPct}>
            P(DD ≥ {t.ddPct}%):{" "}
            <b
              style={{
                color:
                  t.probability > 0.2
                    ? "#ef5350"
                    : t.probability > 0.05
                      ? "#f0b132"
                      : "#26a69a",
              }}
            >
              {(t.probability * 100).toFixed(0)}%
            </b>
          </span>
        ))}
      </div>
      <div style={{ fontSize: 9, color: "#8b949e", marginTop: 3 }}>
        Final equity at {ror.horizon} trades: bad-luck{" "}
        {ror.p5FinalMult.toFixed(2)}× · median {ror.medianFinalMult.toFixed(2)}×
        · good-luck {ror.p95FinalMult.toFixed(2)}×
      </div>
    </div>
  );
}

function exportTradesCsv(result: BacktestResult) {
  const header = [
    "#",
    "symbol",
    "timeframe",
    "entry",
    "exit",
    "sl",
    "tp",
    "shares",
    "outcome",
    "rMultiple",
    "grossPnl",
    "feesPaid",
    "pnlAbs",
    "beMoved",
    "partialTaken",
    "trailedOut",
    "balanceAfter",
  ];
  const rows = result.trades.map((t, i) => [
    i + 1,
    result.symbol,
    result.timeframe,
    t.entry,
    t.exit,
    t.sl,
    t.tp,
    t.shares,
    t.outcome,
    t.rMultiple.toFixed(4),
    t.grossPnl.toFixed(2),
    t.feesPaid.toFixed(2),
    t.pnlAbs.toFixed(2),
    t.beMoved,
    t.partialTaken,
    t.trailedOut,
    t.balanceAfter.toFixed(2),
  ]);
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backtest-${result.symbol}-${result.timeframe}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function EquitySpark({ equity }: { equity: Array<{ balance: number }> }) {
  if (equity.length < 2) return null;
  const w = 500;
  const h = 70;
  const xs = equity.map((_, i) => (i / (equity.length - 1)) * w);
  const min = Math.min(...equity.map((e) => e.balance));
  const max = Math.max(...equity.map((e) => e.balance));
  const range = max - min || 1;
  const points = equity
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
        points={points}
      />
    </svg>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: React.ReactNode;
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

const wrapStyle: React.CSSProperties = { position: "relative" };

// When hosted inside the Backtest drawer: flow inline instead of floating popover.
const embeddedPanelStyle: React.CSSProperties = {
  position: "static",
  width: "100%",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  fontSize: 11,
  color: "#c9d1d9",
};

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

const panelStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "100%",
  left: 0,
  marginBottom: 4,
  width: 580,
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  boxShadow: "0 -4px 16px rgba(0,0,0,0.5)",
  zIndex: 60,
  fontSize: 11,
  color: "#c9d1d9",
};

const sectionStyle: React.CSSProperties = {
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const selectStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "inherit",
  padding: "3px 4px",
  background: "#161b22",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
};
const inputStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "inherit",
  padding: "3px 4px",
  background: "#161b22",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
  width: 60,
};

const runBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 11,
  fontFamily: "inherit",
  background: "#1f6feb",
  color: "#fff",
  border: "none",
  borderRadius: 3,
  cursor: "pointer",
  marginLeft: "auto",
};

const errorStyle: React.CSSProperties = {
  margin: "0 12px 8px",
  padding: "6px 8px",
  background: "#2d1b1b",
  border: "1px solid #f8514926",
  borderRadius: 3,
  color: "#ef5350",
  fontSize: 11,
};

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(8, 1fr)",
  gap: 4,
  background: "#161b22",
  borderRadius: 3,
  padding: "8px 4px",
};

const tabBtnStyle: React.CSSProperties = {
  padding: "2px 8px",
  fontSize: 10,
  fontFamily: "inherit",
  background: "#161b22",
  color: "#8b949e",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
};
const activeTabStyle: React.CSSProperties = {
  color: "#c9d1d9",
  borderColor: "#388bfd",
  background: "#1f2937",
};

const tradeListStyleWide: React.CSSProperties = {
  maxHeight: 240,
  overflowY: "auto",
  fontSize: 10,
  borderRadius: 3,
  border: "1px solid #21262d",
  marginTop: 4,
};
const tradeHeaderStyleWide: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px 1fr 1fr 40px 60px 40px 50px 50px 50px 50px 60px",
  gap: 4,
  padding: "4px 6px",
  background: "#161b22",
  color: "#8b949e",
  position: "sticky",
  top: 0,
  fontSize: 9,
  textTransform: "uppercase",
};
const tradeRowStyleWide: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px 1fr 1fr 40px 60px 40px 50px 50px 50px 50px 60px",
  gap: 4,
  padding: "3px 6px",
  fontFamily: "ui-monospace, monospace",
};

const replayBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 8px",
  marginTop: 4,
  marginBottom: 4,
  background: "#161b22",
  border: "1px solid #21262d",
  borderRadius: 3,
  flexWrap: "wrap",
};
const stepBtnStyle: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 10,
  background: "#0d1117",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
};
const speedSelectStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "3px 4px",
  background: "#0d1117",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
};
const dateInputStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 4px",
  background: "#0d1117",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
};
const cursorBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#8b949e",
  marginLeft: "auto",
  fontFamily: "ui-monospace, monospace",
};
const perRuleWrapStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "6px 8px",
  background: "#161b22",
  border: "1px solid #21262d",
  borderRadius: 3,
  fontSize: 10,
};
const perRuleHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 40px 50px 50px 50px 60px",
  gap: 6,
  color: "#8b949e",
  fontSize: 9,
  textTransform: "uppercase",
  padding: "2px 0",
  borderBottom: "1px solid #21262d",
};
const perRuleRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 40px 50px 50px 50px 60px",
  gap: 6,
  padding: "3px 0",
  fontFamily: "ui-monospace, monospace",
};
const presetBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11,
  fontFamily: "inherit",
  background: "#161b22",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};
const summaryBoxStyle: React.CSSProperties = {
  padding: "8px 10px",
  marginBottom: 6,
  background: "#0a0e13",
  border: "1px solid #21262d",
  borderRadius: 3,
  borderLeft: "3px solid #388bfd",
};
