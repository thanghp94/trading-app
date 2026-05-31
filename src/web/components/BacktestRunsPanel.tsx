import { useEffect, useState } from "react";

interface SavedRun {
  id: string;
  label: string;
  symbol: string;
  timeframe: string;
  fromDate: string | null;
  toDate: string | null;
  config: Record<string, unknown>;
  stats: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    avgR: number;
    sumR: number;
    maxDrawdownPct: number;
    pnlPct: number;
    totalFees?: number;
  };
  createdAt: number;
}

/**
 * Saved-runs explorer. Lists persisted backtest runs, lets you select up
 * to N for side-by-side diff, and delete stale entries. Saving happens
 * from VnBacktestPanel via the `onSave` parent callback (POST /api/backtest/save).
 */
export function BacktestRunsPanel({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const show = embedded || open;
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backtest/runs");
      setRuns((await res.json()) as SavedRun[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) void reload();
  }, [show]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this run?")) return;
    await fetch(`/api/backtest/runs/${id}`, { method: "DELETE" });
    setSelected((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    await reload();
  };

  const selectedRuns = runs.filter((r) => selected.has(r.id));

  return (
    <div style={{ position: "relative" }}>
      {!embedded && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ ...headerBtnStyle, ...(open ? activeBtnStyle : {}) }}
        >
          💾 Saved Runs {open ? "▾" : "▸"}
        </button>
      )}
      {show && (
        <div style={embedded ? embeddedPanelStyle : panelStyle}>
          <div style={headerRowStyle}>
            <span>Saved backtest runs ({runs.length})</span>
            <button type="button" onClick={reload} style={smallBtnStyle}>
              ↻ Refresh
            </button>
          </div>

          {loading && (
            <div style={{ padding: 12, color: "#8b949e" }}>Loading…</div>
          )}

          {!loading && runs.length === 0 && (
            <div style={{ padding: 12, color: "#8b949e", fontSize: 11 }}>
              No saved runs yet. Run a backtest and click "Save run".
            </div>
          )}

          {!loading && runs.length > 0 && (
            <div style={tableWrapStyle}>
              <div style={headerCellsStyle}>
                <span></span>
                <span>Label</span>
                <span>Sym</span>
                <span>TF</span>
                <span>N</span>
                <span>Win%</span>
                <span>AvgR</span>
                <span>SumR</span>
                <span>PnL%</span>
                <span>DD%</span>
                <span>Fees</span>
                <span></span>
              </div>
              {runs.map((r) => (
                <div
                  key={r.id}
                  style={{
                    ...rowCellsStyle,
                    background: selected.has(r.id) ? "#1f2937" : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <span
                    title={r.label}
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.label}
                  </span>
                  <span>{r.symbol}</span>
                  <span>{r.timeframe}</span>
                  <span>{r.stats.total}</span>
                  <span
                    style={{
                      color: r.stats.winRate >= 0.5 ? "#26a69a" : "#ef5350",
                    }}
                  >
                    {(r.stats.winRate * 100).toFixed(0)}
                  </span>
                  <span
                    style={{ color: r.stats.avgR >= 0 ? "#26a69a" : "#ef5350" }}
                  >
                    {r.stats.avgR.toFixed(2)}
                  </span>
                  <span
                    style={{ color: r.stats.sumR >= 0 ? "#26a69a" : "#ef5350" }}
                  >
                    {r.stats.sumR.toFixed(1)}
                  </span>
                  <span
                    style={{
                      color: r.stats.pnlPct >= 0 ? "#26a69a" : "#ef5350",
                    }}
                  >
                    {r.stats.pnlPct >= 0 ? "+" : ""}
                    {r.stats.pnlPct.toFixed(1)}
                  </span>
                  <span style={{ color: "#ef5350" }}>
                    {r.stats.maxDrawdownPct.toFixed(1)}
                  </span>
                  <span style={{ color: "#8b949e" }}>
                    {r.stats.totalFees?.toFixed(0) ?? "–"}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    style={delBtnStyle}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Diff view */}
          {selectedRuns.length >= 2 && (
            <div style={diffWrapStyle}>
              <div style={{ fontSize: 11, color: "#c9d1d9", marginBottom: 6 }}>
                Compare {selectedRuns.length} runs:
              </div>
              <div
                style={{
                  ...diffGridStyle,
                  gridTemplateColumns: `120px repeat(${selectedRuns.length}, 1fr)`,
                }}
              >
                <span style={diffLabelStyle}>Config key</span>
                {selectedRuns.map((r) => (
                  <span key={r.id} style={diffHeaderStyle}>
                    {r.label}
                  </span>
                ))}
                {diffConfigKeys(selectedRuns).map((k) => (
                  <DiffRow key={k} k={k} runs={selectedRuns} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiffRow({ k, runs }: { k: string; runs: SavedRun[] }) {
  const vals = runs.map((r) => String(r.config[k] ?? "–"));
  const allSame = vals.every((v) => v === vals[0]);
  return (
    <>
      <span
        style={{ ...diffLabelStyle, color: allSame ? "#6e7681" : "#f0b132" }}
      >
        {k}
      </span>
      {vals.map((v, i) => (
        <span
          key={i}
          style={{ ...diffCellStyle, color: allSame ? "#6e7681" : "#f0b132" }}
        >
          {v}
        </span>
      ))}
    </>
  );
}

function diffConfigKeys(runs: SavedRun[]): string[] {
  const keys = new Set<string>();
  for (const r of runs) Object.keys(r.config).forEach((k) => keys.add(k));
  return [...keys].sort();
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
  maxHeight: "70vh",
  overflowY: "auto",
};
const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 12px",
  background: "#161b22",
  borderBottom: "1px solid #30363d",
};
const smallBtnStyle: React.CSSProperties = {
  padding: "2px 8px",
  fontSize: 10,
  background: "#0d1117",
  color: "#8b949e",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
};
const tableWrapStyle: React.CSSProperties = { padding: "4px 8px" };
const headerCellsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "24px 1fr 60px 40px 30px 40px 40px 40px 50px 40px 50px 24px",
  gap: 4,
  padding: "4px 4px",
  fontSize: 9,
  color: "#8b949e",
  borderBottom: "1px solid #21262d",
  textTransform: "uppercase",
};
const rowCellsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "24px 1fr 60px 40px 30px 40px 40px 40px 50px 40px 50px 24px",
  gap: 4,
  padding: "4px 4px",
  fontSize: 10,
  alignItems: "center",
  borderBottom: "1px solid #161b22",
};
const delBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#6e7681",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
};
const diffWrapStyle: React.CSSProperties = {
  padding: 10,
  borderTop: "1px solid #30363d",
  background: "#0a0e13",
};
const diffGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "2px 8px",
  fontSize: 10,
  fontFamily: "ui-monospace, monospace",
};
const diffLabelStyle: React.CSSProperties = { color: "#8b949e" };
const diffHeaderStyle: React.CSSProperties = {
  color: "#c9d1d9",
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const diffCellStyle: React.CSSProperties = { color: "#c9d1d9" };
