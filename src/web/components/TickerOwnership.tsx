import { useState, useEffect } from "react";

interface OwnershipStructure {
  foreignPct: number | null;
  statePct: number | null;
  freeFloatPct: number | null;
}
interface Shareholder {
  name: string | null;
  quantity: number | null;
  pct: number | null;
  asOf: string | null;
}
interface Officer {
  name: string | null;
  position: string | null;
  quantity: number | null;
  pct: number | null;
}
interface Ownership {
  symbol: string;
  structure: OwnershipStructure;
  shareholders: Shareholder[];
  officers: Officer[];
  asOf: number;
}

interface Props {
  symbol: string;
}

const DASH = "—";

function qty(v: number | null): string {
  return v == null ? DASH : v.toLocaleString("vi-VN");
}
function pct(v: number | null): string {
  return v == null ? DASH : `${(v * 100).toFixed(2)}%`;
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
const tdLeft: React.CSSProperties = {
  ...tdStyle,
  textAlign: "left",
  color: "#ddd",
  whiteSpace: "normal",
};

export function TickerOwnership({ symbol }: Props) {
  const [data, setData] = useState<Ownership | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setData(null);
    fetch(`/api/ownership/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: Ownership) => {
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
        Không có dữ liệu sở hữu cho {symbol}.
      </div>
    );

  const { structure, shareholders, officers } = data;
  const cards = [
    { label: "Sở hữu nước ngoài", value: pct(structure.foreignPct) },
    { label: "Sở hữu nhà nước", value: pct(structure.statePct) },
    { label: "Tự do chuyển nhượng", value: pct(structure.freeFloatPct) },
  ];

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
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

      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        Cổ đông lớn
      </div>
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left" }}>Cổ đông</th>
              <th style={thStyle}>SL cổ phần</th>
              <th style={thStyle}>Tỷ lệ</th>
            </tr>
          </thead>
          <tbody>
            {shareholders.map((s, i) => (
              <tr key={`${s.name ?? "?"}-${i}`}>
                <td style={tdLeft}>{s.name ?? DASH}</td>
                <td style={tdStyle}>{qty(s.quantity)}</td>
                <td style={tdStyle}>{pct(s.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        Ban lãnh đạo
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left" }}>Lãnh đạo</th>
              <th style={{ ...thStyle, textAlign: "left" }}>Chức vụ</th>
              <th style={thStyle}>Tỷ lệ</th>
            </tr>
          </thead>
          <tbody>
            {officers.map((o, i) => (
              <tr key={`${o.name ?? "?"}-${i}`}>
                <td style={tdLeft}>{o.name ?? DASH}</td>
                <td style={tdLeft}>{o.position ?? DASH}</td>
                <td style={tdStyle}>{pct(o.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
