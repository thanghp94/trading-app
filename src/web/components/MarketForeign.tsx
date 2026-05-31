/** Khối ngoại (Foreign investor flow) panel. */

export interface ForeignFlowRow {
  exchange: string; // HSX / HNX / UPCOM
  buyVal: number; // VND billion
  sellVal: number;
  netVal: number;
}

interface Props {
  flows: ForeignFlowRow[] | null;
  unavailable?: boolean;
}

function fmtBil(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)} tỷ`;
}

function Bar({ buyVal, sellVal }: { buyVal: number; sellVal: number }) {
  const max = Math.max(buyVal, sellVal, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            width: 28,
            fontSize: 9,
            color: "#4caf50",
            textAlign: "right",
          }}
        >
          Mua
        </span>
        <div
          style={{
            flex: 1,
            height: 10,
            background: "#1a1a1a",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(buyVal / max) * 100}%`,
              height: "100%",
              background: "#2e7d32",
              borderRadius: 2,
            }}
          />
        </div>
        <span style={{ width: 56, fontSize: 9, color: "#4caf50" }}>
          {buyVal.toFixed(0)}B
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            width: 28,
            fontSize: 9,
            color: "#ef5350",
            textAlign: "right",
          }}
        >
          Bán
        </span>
        <div
          style={{
            flex: 1,
            height: 10,
            background: "#1a1a1a",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(sellVal / max) * 100}%`,
              height: "100%",
              background: "#c62828",
              borderRadius: 2,
            }}
          />
        </div>
        <span style={{ width: 56, fontSize: 9, color: "#ef5350" }}>
          {sellVal.toFixed(0)}B
        </span>
      </div>
    </div>
  );
}

export function MarketForeign({ flows, unavailable }: Props) {
  if (unavailable || !flows) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#555" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
        <div style={{ fontSize: 13, marginBottom: 4, color: "#777" }}>
          Khối ngoại chưa có dữ liệu
        </div>
        <div style={{ fontSize: 11, color: "#444", lineHeight: 1.6 }}>
          API giao dịch nước ngoài theo phiên yêu cầu xác thực.
          <br />
          Dữ liệu sẽ có sau khi tích hợp SSI / DNSE có tài khoản.
        </div>
      </div>
    );
  }

  const totalBuy = flows.reduce((s, r) => s + r.buyVal, 0);
  const totalSell = flows.reduce((s, r) => s + r.sellVal, 0);
  const totalNet = totalBuy - totalSell;

  return (
    <div
      style={{
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          padding: "10px 0",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        {[
          { label: "Mua ròng", val: totalBuy, color: "#4caf50" },
          { label: "Bán ròng", val: totalSell, color: "#ef5350" },
          {
            label: "Ròng",
            val: totalNet,
            color: totalNet >= 0 ? "#4caf50" : "#ef5350",
          },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#666", marginBottom: 2 }}>
              {label}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color,
                fontFamily: "monospace",
              }}
            >
              {fmtBil(val)}
            </div>
          </div>
        ))}
      </div>

      {/* Per-exchange bars */}
      {flows.map((row) => (
        <div key={row.exchange}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: "#ccc" }}>
              {row.exchange}
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: row.netVal >= 0 ? "#4caf50" : "#ef5350",
              }}
            >
              {fmtBil(row.netVal)}
            </span>
          </div>
          <Bar buyVal={row.buyVal} sellVal={row.sellVal} />
        </div>
      ))}

      {/* Table */}
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}
      >
        <thead>
          <tr style={{ color: "#555", borderBottom: "1px solid #2a2a2a" }}>
            {["Sàn", "Mua (tỷ)", "Bán (tỷ)", "Ròng (tỷ)"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "4px 6px",
                  textAlign: "right",
                  fontWeight: 400,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flows.map((row) => (
            <tr
              key={row.exchange}
              style={{ borderBottom: "1px solid #1a1a1a" }}
            >
              <td style={{ padding: "5px 6px", color: "#ccc" }}>
                {row.exchange}
              </td>
              <td
                style={{
                  padding: "5px 6px",
                  textAlign: "right",
                  color: "#4caf50",
                  fontFamily: "monospace",
                }}
              >
                {row.buyVal.toFixed(0)}
              </td>
              <td
                style={{
                  padding: "5px 6px",
                  textAlign: "right",
                  color: "#ef5350",
                  fontFamily: "monospace",
                }}
              >
                {row.sellVal.toFixed(0)}
              </td>
              <td
                style={{
                  padding: "5px 6px",
                  textAlign: "right",
                  fontFamily: "monospace",
                  color: row.netVal >= 0 ? "#4caf50" : "#ef5350",
                }}
              >
                {fmtBil(row.netVal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
