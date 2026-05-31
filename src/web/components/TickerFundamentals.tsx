import { useState, useEffect } from "react";

interface Valuation {
  symbol: string;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
  marketCap: number | null;
  dividendYield: number | null;
  asOf: number;
}

interface FinancialStatement {
  period: string;
  revenue: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
  operatingCashflow: number | null;
}

interface Fundamentals {
  valuation: Valuation;
  statements: FinancialStatement[];
}

interface Props {
  symbol: string;
}

const DASH = "—";

/** Plain number with VN grouping, or em-dash when null. */
function num(v: number | null): string {
  return v == null ? DASH : v.toLocaleString("vi-VN");
}

/** Ratio to 2 decimals (P/E, P/B), or em-dash. */
function ratio(v: number | null): string {
  return v == null ? DASH : v.toFixed(2);
}

/** Fraction → percent string (ROE 0.268 → "26.8%"), or em-dash. */
function pct(v: number | null): string {
  return v == null ? DASH : `${(v * 100).toFixed(1)}%`;
}

/** Large VND amount in tỷ (billions), or em-dash. */
function billions(v: number | null): string {
  return v == null
    ? DASH
    : `${(v / 1e9).toLocaleString("vi-VN", {
        maximumFractionDigits: 0,
      })} tỷ`;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};
const valueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "#e8e8e8",
};
const cardStyle: React.CSSProperties = {
  border: "1px solid #2a2a2a",
  borderRadius: 6,
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const thStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 8px",
  fontSize: 11,
  color: "#888",
  borderBottom: "1px solid #2a2a2a",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 8px",
  fontSize: 12,
  color: "#ddd",
  whiteSpace: "nowrap",
};

export function TickerFundamentals({ symbol }: Props) {
  const [data, setData] = useState<Fundamentals | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setData(null);
    fetch(`/api/fundamentals/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: Fundamentals) => {
        if (!alive) return;
        setData(json);
        setStatus("ok");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  if (status === "loading")
    return <div style={{ padding: 16, color: "#888" }}>Đang tải dữ liệu…</div>;
  if (status === "error" || !data)
    return (
      <div style={{ padding: 16, color: "#c66" }}>
        Không có dữ liệu cơ bản cho {symbol}.
      </div>
    );

  const { valuation: v, statements } = data;
  const cards: Array<{ label: string; value: string }> = [
    { label: "Vốn hóa", value: billions(v.marketCap) },
    { label: "P/E", value: ratio(v.pe) },
    { label: "P/B", value: ratio(v.pb) },
    { label: "ROE", value: pct(v.roe) },
    { label: "EPS", value: num(v.eps) },
    { label: "Tỷ suất cổ tức", value: pct(v.dividendYield) },
  ];

  const rows: Array<{ label: string; key: keyof FinancialStatement }> = [
    { label: "Doanh thu", key: "revenue" },
    { label: "Lợi nhuận gộp", key: "grossProfit" },
    { label: "LN sau thuế", key: "netProfit" },
    { label: "Tổng tài sản", key: "totalAssets" },
    { label: "Vốn chủ sở hữu", key: "totalEquity" },
    { label: "LCTT hoạt động", key: "operatingCashflow" },
  ];

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      {/* Valuation cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {cards.map((c) => (
          <div key={c.label} style={cardStyle}>
            <span style={labelStyle}>{c.label}</span>
            <span style={valueStyle}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Statements table */}
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        Tài chính theo quý (tỷ VND)
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left" }}>Chỉ tiêu</th>
              {statements.map((s) => (
                <th key={s.period} style={thStyle}>
                  {s.period}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={{ ...tdStyle, textAlign: "left", color: "#aaa" }}>
                  {r.label}
                </td>
                {statements.map((s) => (
                  <td key={s.period} style={tdStyle}>
                    {billions(s[r.key] as number | null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
