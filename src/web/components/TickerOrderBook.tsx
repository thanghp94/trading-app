import type { DepthSnapshot } from "../../shared/types.js";

interface Props {
  depth: DepthSnapshot | null;
  symbol?: string;
}

function fmtPrice(p: number) {
  return (p / 1000).toFixed(2);
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function DepthRow({
  bidVol,
  bidPrice,
  askPrice,
  askVol,
  maxVol,
}: {
  bidVol: number;
  bidPrice: number;
  askPrice: number;
  askVol: number;
  maxVol: number;
}) {
  const bidPct = maxVol > 0 ? (bidVol / maxVol) * 100 : 0;
  const askPct = maxVol > 0 ? (askVol / maxVol) * 100 : 0;

  return (
    <tr>
      {/* Bid side */}
      <td
        style={{
          position: "relative",
          padding: "5px 8px",
          textAlign: "right",
          color: "#4caf50",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: `${bidPct}%`,
            background: "rgba(46,125,50,0.2)",
          }}
        />
        <span style={{ position: "relative" }}>{fmtVol(bidVol)}</span>
      </td>
      <td
        style={{
          padding: "5px 8px",
          textAlign: "right",
          color: "#4caf50",
          fontFamily: "monospace",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {fmtPrice(bidPrice)}
      </td>
      {/* Ask side */}
      <td
        style={{
          padding: "5px 8px",
          textAlign: "right",
          color: "#ef5350",
          fontFamily: "monospace",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {fmtPrice(askPrice)}
      </td>
      <td
        style={{
          position: "relative",
          padding: "5px 8px",
          textAlign: "left",
          color: "#ef5350",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${askPct}%`,
            background: "rgba(198,40,40,0.2)",
          }}
        />
        <span style={{ position: "relative" }}>{fmtVol(askVol)}</span>
      </td>
    </tr>
  );
}

export function TickerOrderBook({ depth, symbol }: Props) {
  if (!depth) {
    return (
      <div style={{ padding: "12px 8px" }}>
        <div
          style={{
            fontSize: 10,
            color: "#555",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Dư mua / Dư bán
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#444",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Sổ lệnh chưa hỗ trợ
          <br />
          <span style={{ color: "#333", fontSize: 10 }}>cho thị trường VN</span>
        </div>
      </div>
    );
  }

  const rows = 3;
  const topBids = depth.bids.slice(0, rows);
  const topAsks = depth.asks.slice(0, rows);
  const allVols = [...topBids.map(([, v]) => v), ...topAsks.map(([, v]) => v)];
  const maxVol = Math.max(...allVols, 1);

  return (
    <div style={{ padding: "4px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
            <th
              style={{
                padding: "3px 8px",
                textAlign: "right",
                fontSize: 10,
                color: "#555",
                fontWeight: 400,
              }}
            >
              KL Mua
            </th>
            <th
              style={{
                padding: "3px 8px",
                textAlign: "right",
                fontSize: 10,
                color: "#4caf50",
                fontWeight: 400,
              }}
            >
              Giá Mua
            </th>
            <th
              style={{
                padding: "3px 8px",
                textAlign: "right",
                fontSize: 10,
                color: "#ef5350",
                fontWeight: 400,
              }}
            >
              Giá Bán
            </th>
            <th
              style={{
                padding: "3px 8px",
                textAlign: "left",
                fontSize: 10,
                color: "#555",
                fontWeight: 400,
              }}
            >
              KL Bán
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => {
            const bid = topBids[i];
            const ask = topAsks[i];
            if (!bid && !ask) return null;
            return (
              <DepthRow
                key={i}
                bidVol={bid?.[1] ?? 0}
                bidPrice={bid?.[0] ?? 0}
                askPrice={ask?.[0] ?? 0}
                askVol={ask?.[1] ?? 0}
                maxVol={maxVol}
              />
            );
          })}
        </tbody>
      </table>
      {symbol && (
        <div
          style={{
            fontSize: 9,
            color: "#444",
            textAlign: "right",
            padding: "4px 8px",
          }}
        >
          {symbol}
        </div>
      )}
    </div>
  );
}
