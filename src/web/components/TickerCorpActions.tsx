import { useState, useEffect } from "react";

interface CorpEvent {
  code: string | null;
  category: string | null;
  nameVi: string | null;
  nameEn: string | null;
  titleVi: string | null;
  titleEn: string | null;
  date: string | null;
  publicDate: string | null;
  recordDate: string | null;
  exrightDate: string | null;
  payoutDate: string | null;
  valuePerShare: number | null;
  exerciseRatio: number | null;
}
interface CorpActionCalendar {
  symbol: string;
  events: CorpEvent[];
  asOf: number;
}

interface Props {
  symbol: string;
}

const DASH = "—";

function dateText(v: string | null): string {
  return v ?? DASH;
}

/** Dividend value (VND/share) or, when absent, the exercise ratio. */
function valueText(e: CorpEvent): string {
  if (e.valuePerShare != null)
    return `${e.valuePerShare.toLocaleString("vi-VN")} đ`;
  if (e.exerciseRatio != null) return `${(e.exerciseRatio * 100).toFixed(1)}%`;
  return DASH;
}

// Subtle colour cue per event category.
const CATEGORY_COLOR: Record<string, string> = {
  DIV: "#4ade80",
  ISS: "#60a5fa",
  AIS: "#60a5fa",
  AGME: "#fbbf24",
  DDIND: "#a78bfa",
  DDRP: "#a78bfa",
  DDINS: "#a78bfa",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 11,
  color: "#888",
  borderBottom: "1px solid #2a2a2a",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12,
  color: "#ddd",
  verticalAlign: "top",
};

export function TickerCorpActions({ symbol }: Props) {
  const [data, setData] = useState<CorpActionCalendar | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setData(null);
    fetch(`/api/corp-actions/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: CorpActionCalendar) => {
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
        Không có dữ liệu sự kiện cho {symbol}.
      </div>
    );

  if (data.events.length === 0)
    return (
      <div style={{ padding: 16, color: "#888" }}>
        Chưa có sự kiện nào cho {symbol}.
      </div>
    );

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={thStyle}>Ngày</th>
              <th style={thStyle}>Loại</th>
              <th style={thStyle}>Nội dung</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((e, i) => (
              <tr key={`${e.code ?? "?"}-${e.date ?? i}-${i}`}>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  {dateText(e.date)}
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      color: (e.code && CATEGORY_COLOR[e.code]) || "#bbb",
                    }}
                  >
                    {e.nameVi ?? e.code ?? DASH}
                  </span>
                </td>
                <td style={tdStyle}>{e.titleVi ?? e.titleEn ?? DASH}</td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {valueText(e)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
