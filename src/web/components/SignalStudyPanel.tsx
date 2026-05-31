import { useState } from "react";
import { SignalStudyDetail } from "./SignalStudyDetail.js";

// ── Local type declarations (mirror server-side types, never import server code) ──

type Horizon = 3 | 5 | 10 | 20 | 60 | 180;
type ByHorizon = Record<Horizon, number | null>;

interface SignalRow {
  key: string;
  labelVi: string;
  labelEn: string;
  avgByHorizon: ByHorizon;
  winByHorizon: ByHorizon;
  avgOverall: number | null;
  events: number;
}

interface PerYear {
  year: number;
  byHorizon: ByHorizon;
  overall: number | null;
}

interface SignalDetail {
  key: string;
  labelVi: string;
  eventIdx: number[];
  avgByHorizon: ByHorizon;
  winByHorizon: ByHorizon;
  optimalAvgHorizon: Horizon | null;
  optimalWinHorizon: Horizon | null;
  bestPeriod: { horizon: Horizon; year: number; value: number } | null;
  worstPeriod: { horizon: Horizon; year: number; value: number } | null;
  donut: { win: number; breakeven: number; loss: number; total: number };
  perYearAvg: PerYear[];
  perYearWin: PerYear[];
}

interface StudyConclusion {
  shortTerm?: { key: string; labelVi: string; horizon: Horizon; value: number };
  longTerm?: { key: string; labelVi: string; horizon: Horizon; value: number };
  recent7d: boolean;
}

interface StudyResult {
  symbol: string;
  bars: number;
  fromTime: number;
  toTime: number;
  rows: SignalRow[];
  details: Record<string, SignalDetail>;
  conclusion: StudyConclusion;
  closes: number[];
  volumes: number[];
  times: number[];
}

// ── Component ──

const HORIZONS: Horizon[] = [3, 5, 10, 20, 60, 180];

interface SignalStudyPanelProps {
  embedded?: boolean;
}

export function SignalStudyPanel({ embedded = false }: SignalStudyPanelProps) {
  const [symbol, setSymbol] = useState("ORS");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StudyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/signal-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          fromDate,
          toDate,
        }),
      });
      const json = (await res.json()) as StudyResult & { error?: string };
      if (json.error) {
        setError(json.error);
        return;
      }
      setResult(json);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const activeDetail =
    detailKey && result ? (result.details[detailKey] ?? null) : null;

  return (
    <div style={embedded ? embeddedWrap : standAloneWrap}>
      {/* Controls */}
      <div style={sectionStyle}>
        <div style={rowStyle}>
          <Field label="Symbol">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              style={{ ...inputStyle, width: 70 }}
              placeholder="e.g. ORS"
            />
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
          <button
            type="button"
            onClick={run}
            disabled={busy}
            style={runBtnStyle}
          >
            {busy ? "Đang phân tích…" : `▶ Kiểm thử ${symbol}`}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <div style={errorStyle}>{error}</div>}

      {/* Results */}
      {result && (
        <>
          {/* Conclusion */}
          <ConclusionBox conclusion={result.conclusion} />

          {/* Grid */}
          <div style={gridWrapStyle}>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tín hiệu</th>
                    {HORIZONS.map((h) => (
                      <th key={h} style={{ ...thStyle, ...numThStyle }}>
                        T+{h}
                      </th>
                    ))}
                    <th style={{ ...thStyle, ...numThStyle }}>TB</th>
                    <th style={{ ...thStyle, width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <GridRow
                      key={row.key}
                      row={row}
                      zebra={i % 2 === 0}
                      onDetail={() => setDetailKey(row.key)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div
              style={{
                fontSize: 9,
                color: "#6e7681",
                marginTop: 4,
                paddingLeft: 2,
              }}
            >
              Số liệu: lợi nhuận trung bình (%) theo ngày nắm giữ · ô xanh đậm =
              tốt nhất theo hàng
            </div>
          </div>
        </>
      )}

      {/* Detail modal */}
      {activeDetail && result && (
        <SignalStudyDetail
          symbol={result.symbol}
          detail={activeDetail}
          closes={result.closes}
          volumes={result.volumes}
          times={result.times}
          onClose={() => setDetailKey(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

function ConclusionBox({ conclusion }: { conclusion: StudyConclusion }) {
  const { shortTerm, longTerm, recent7d } = conclusion;
  return (
    <div style={conclusionStyle}>
      <div style={conclusionTitleStyle}>Kết luận</div>
      {shortTerm && (
        <div style={bulletStyle}>
          <span style={{ color: "#26a69a" }}>▶</span>{" "}
          <b>Chiến lược ngắn hạn:</b> {shortTerm.labelVi} đem lại lợi nhuận TB
          cao nhất{" "}
          <span style={{ color: "#26a69a" }}>
            {shortTerm.value.toFixed(1)}%
          </span>{" "}
          khi nắm giữ <b>{shortTerm.horizon} ngày</b>
        </div>
      )}
      {longTerm && (
        <div style={bulletStyle}>
          <span style={{ color: "#26a69a" }}>▶</span> <b>Chiến lược dài hạn:</b>{" "}
          {longTerm.labelVi} đem lại lợi nhuận TB cao nhất{" "}
          <span style={{ color: "#26a69a" }}>{longTerm.value.toFixed(1)}%</span>{" "}
          khi nắm giữ <b>{longTerm.horizon} ngày</b>
        </div>
      )}
      <div style={bulletStyle}>
        <span style={{ color: recent7d ? "#f0b132" : "#8b949e" }}>●</span> Trong
        7 ngày vừa qua{" "}
        {recent7d ? (
          <span style={{ color: "#f0b132" }}>có xuất hiện tín hiệu</span>
        ) : (
          <span style={{ color: "#8b949e" }}>không xuất hiện tín hiệu nào</span>
        )}
      </div>
    </div>
  );
}

function GridRow({
  row,
  zebra,
  onDetail,
}: {
  row: SignalRow;
  zebra: boolean;
  onDetail: () => void;
}) {
  // Find best (max non-null) horizon avg in row
  const nonNullAvgs = HORIZONS.map((h) => row.avgByHorizon[h]).filter(
    (v): v is number => v !== null,
  );
  const rowMax = nonNullAvgs.length > 0 ? Math.max(...nonNullAvgs) : null;

  return (
    <tr style={{ background: zebra ? "#0d1117" : "#161b22" }}>
      <td style={tdStyle}>
        <span title={row.labelEn} style={{ cursor: "default" }}>
          {row.labelVi}
        </span>
        <span style={{ color: "#6e7681", fontSize: 9, marginLeft: 4 }}>
          ({row.events})
        </span>
      </td>
      {HORIZONS.map((h) => {
        const v = row.avgByHorizon[h];
        const isBest = rowMax !== null && v !== null && v === rowMax;
        return (
          <td
            key={h}
            style={{
              ...tdStyle,
              ...numTdStyle,
              background: isBest ? "rgba(38,166,154,0.18)" : undefined,
              color: v === null ? "#6e7681" : v >= 0 ? "#26a69a" : "#ef5350",
              fontWeight: isBest ? 700 : undefined,
            }}
          >
            {v === null ? "—" : v.toFixed(1)}
          </td>
        );
      })}
      <td
        style={{
          ...tdStyle,
          ...numTdStyle,
          color:
            row.avgOverall === null
              ? "#6e7681"
              : row.avgOverall >= 0
                ? "#26a69a"
                : "#ef5350",
        }}
      >
        {row.avgOverall === null ? "—" : row.avgOverall.toFixed(1)}
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <button type="button" onClick={onDetail} style={detailBtnStyle}>
          Xem chi tiết
        </button>
      </td>
    </tr>
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

// ── Styles ──

const embeddedWrap: React.CSSProperties = {
  position: "static",
  width: "100%",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  fontSize: 11,
  color: "#c9d1d9",
};

const standAloneWrap: React.CSSProperties = {
  fontSize: 11,
  color: "#c9d1d9",
  background: "#0d1117",
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

const inputStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "inherit",
  padding: "3px 4px",
  background: "#161b22",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
  width: 110,
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

const conclusionStyle: React.CSSProperties = {
  margin: "0 12px 8px",
  padding: "8px 10px",
  background: "#0a0e13",
  border: "1px solid #21262d",
  borderLeft: "3px solid #388bfd",
  borderRadius: 3,
};

const conclusionTitleStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#8b949e",
  textTransform: "uppercase",
  marginBottom: 6,
};

const bulletStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#c9d1d9",
  lineHeight: 1.6,
};

const gridWrapStyle: React.CSSProperties = {
  margin: "0 12px 8px",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 10,
  minWidth: 600,
};

const thStyle: React.CSSProperties = {
  padding: "5px 6px",
  textAlign: "left",
  fontSize: 9,
  color: "#8b949e",
  textTransform: "uppercase",
  borderBottom: "1px solid #30363d",
  background: "#161b22",
  whiteSpace: "nowrap",
};

const numThStyle: React.CSSProperties = {
  textAlign: "right",
  width: 48,
};

const tdStyle: React.CSSProperties = {
  padding: "5px 6px",
  borderBottom: "1px solid #21262d",
  whiteSpace: "nowrap",
  fontSize: 11,
};

const numTdStyle: React.CSSProperties = {
  textAlign: "right",
  fontFamily: "ui-monospace, monospace",
};

const detailBtnStyle: React.CSSProperties = {
  padding: "2px 6px",
  fontSize: 9,
  fontFamily: "inherit",
  background: "#161b22",
  color: "#8b949e",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
