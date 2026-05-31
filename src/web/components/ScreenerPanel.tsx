import { useCallback, useEffect, useState } from "react";
import type { ScreenerRow } from "../../shared/screener-types.js";

interface ScreenerPanelProps {
  open: boolean;
  onClose: () => void;
  onPick?: (symbol: string, timeframe: string) => void;
}

type UniverseName = "vn30" | "tracked";

/** Client-side filter chips → predicate over a row's signals. */
const CHIPS: {
  id: string;
  label: string;
  test: (r: ScreenerRow) => boolean;
}[] = [
  { id: "star3", label: "★≥3", test: (r) => r.star >= 3 },
  { id: "up", label: "Uptrend", test: (r) => r.signals.trend === "up" },
  {
    id: "bull",
    label: "Bullish pattern",
    test: (r) => r.signals.bullishPattern,
  },
  { id: "vol", label: "Vol spike", test: (r) => r.signals.volumeSpike },
  {
    id: "support",
    label: "At support",
    test: (r) => r.signals.zoneTouch === "support",
  },
  {
    id: "os",
    label: "RSI oversold",
    test: (r) => r.signals.rsiZone === "oversold",
  },
  {
    id: "ichi",
    label: "Ichimoku tốt",
    test: (r) => r.signals.ichimoku === "good",
  },
  {
    id: "pk",
    label: "Phân kỳ dương",
    test: (r) =>
      r.signals.divergence === "bullish" ||
      r.signals.divergence === "hidden-bullish",
  },
  // Fundamental chips — a row without cached fundamentals fails an active one.
  {
    id: "peLow",
    label: "P/E≤15",
    test: (r) => (r.fundamentals?.pe ?? Infinity) <= 15,
  },
  {
    id: "pbLow",
    label: "P/B≤2",
    test: (r) => (r.fundamentals?.pb ?? Infinity) <= 2,
  },
  {
    id: "roeHigh",
    label: "ROE≥15%",
    test: (r) => (r.fundamentals?.roe ?? -Infinity) >= 0.15,
  },
  {
    id: "div",
    label: "Có cổ tức",
    test: (r) => (r.fundamentals?.dividendYield ?? 0) > 0,
  },
];

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

const DASH = "—";
const fmtRatio = (v: number | null | undefined) =>
  v == null ? DASH : v.toFixed(2);
const fmtPct = (v: number | null | undefined) =>
  v == null ? DASH : `${(v * 100).toFixed(1)}%`;
const fmtBillions = (v: number | null | undefined) =>
  v == null
    ? DASH
    : `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}`;

export function ScreenerPanel({ open, onClose, onPick }: ScreenerPanelProps) {
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [universe, setUniverse] = useState<UniverseName>("vn30");
  const [active, setActive] = useState<Set<string>>(new Set());
  const [sortByValue, setSortByValue] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/screener?universe=${universe}`);
      const data = (await res.json()) as { rows: ScreenerRow[] };
      setRows(data.rows ?? []);
    } catch {
      /* ignore — partial/empty is fine */
    } finally {
      setBusy(false);
    }
  }, [universe]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const toggleChip = (id: string) =>
    setActive((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const filtered = rows.filter((r) =>
    [...active].every((id) => CHIPS.find((c) => c.id === id)?.test(r) ?? true),
  );

  // Default order is server's ★/score. Optional client sort by composite value
  // score (rows without a score sort last).
  const displayed = sortByValue
    ? [...filtered].sort(
        (a, b) =>
          (b.fundamentals?.valueScore ?? -1) -
          (a.fundamentals?.valueScore ?? -1),
      )
    : filtered;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>📡 QMV Screener</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value as UniverseName)}
              style={selectStyle}
            >
              <option value="vn30">VN30</option>
              <option value="tracked">Tracked (~90)</option>
            </select>
            <button
              type="button"
              onClick={() => setSortByValue((v) => !v)}
              style={{
                ...refreshBtnStyle,
                ...(sortByValue ? chipActiveStyle : {}),
              }}
              title="Sắp xếp theo điểm giá trị (cơ bản)"
            >
              {sortByValue ? "Sắp: Giá trị" : "Sắp: ★"}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              style={refreshBtnStyle}
            >
              {busy ? "scanning…" : "refresh"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={closeStyle}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={chipRowStyle}>
          {CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleChip(c.id)}
              style={{
                ...chipStyle,
                ...(active.has(c.id) ? chipActiveStyle : {}),
              }}
            >
              {c.label}
            </button>
          ))}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            {busy ? "scanning…" : `${filtered.length}/${rows.length}`}
          </span>
        </div>

        <div style={bodyStyle}>
          {rows.length === 0 && !busy ? (
            <div style={emptyStyle}>No results. Try refresh.</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  {[
                    "★",
                    "Mã",
                    "Ngành",
                    "Đóng cửa",
                    "%",
                    "RSI",
                    "Xu hướng",
                    "Tín hiệu KT",
                    "Blackbox (proxy)",
                    "P/E",
                    "P/B",
                    "ROE",
                    "Vốn hóa (tỷ)",
                    "Điểm GT",
                  ].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr
                    key={r.symbol}
                    style={trStyle}
                    onClick={() => onPick?.(r.symbol, "1d")}
                    title="Click to load chart"
                  >
                    <td style={{ ...tdStyle, color: "var(--accent)" }}>
                      {stars(r.star)}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{r.symbol}</td>
                    <td style={{ ...tdStyle, color: "var(--text-muted)" }}>
                      {r.sector}
                    </td>
                    <td style={tdNumStyle}>
                      {r.close.toLocaleString("vi-VN")}
                    </td>
                    <td
                      style={{
                        ...tdNumStyle,
                        color: r.changePct >= 0 ? "#26a69a" : "#ef5350",
                      }}
                    >
                      {r.changePct >= 0 ? "+" : ""}
                      {r.changePct.toFixed(2)}%
                    </td>
                    <td style={tdNumStyle}>
                      {Number.isFinite(r.signals.rsi)
                        ? r.signals.rsi.toFixed(0)
                        : "—"}
                    </td>
                    <td style={tdStyle}>{trendLabel(r.signals.trend)}</td>
                    <td style={tdStyle}>{taBadges(r)}</td>
                    <td
                      style={{ ...tdStyle, color: "var(--text-muted)" }}
                      title="Display-only — OHLCV proxy, not predictive"
                    >
                      {bbBadges(r)}
                    </td>
                    <td style={tdNumStyle}>{fmtRatio(r.fundamentals?.pe)}</td>
                    <td style={tdNumStyle}>{fmtRatio(r.fundamentals?.pb)}</td>
                    <td style={tdNumStyle}>{fmtPct(r.fundamentals?.roe)}</td>
                    <td style={tdNumStyle}>
                      {fmtBillions(r.fundamentals?.marketCap)}
                    </td>
                    <td style={{ ...tdNumStyle, fontWeight: 600 }}>
                      {r.fundamentals?.valueScore ?? DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={footerStyle}>
          ★ ranks on technicals. Blackbox column is a display-only OHLCV proxy
          (failed predictive gate) — context, not signal. P/E·P/B·ROE·Vốn hóa từ
          cache vnstock (làm mới hàng đêm); Điểm GT là thước đo giá trị
          heuristic.
        </div>
      </div>
    </div>
  );
}

function trendLabel(t: ScreenerRow["signals"]["trend"]): string {
  return t === "up" ? "↑ tăng" : t === "down" ? "↓ giảm" : "→ ngang";
}

function taBadges(r: ScreenerRow): string {
  const s = r.signals;
  const b: string[] = [];
  if (s.bullishPattern) b.push("🟢Pattern");
  if (s.bearishPattern) b.push("🔴Pattern");
  if (s.volumeSpike) b.push("KLĐB");
  if (s.zoneTouch === "support") b.push("@HT");
  if (s.zoneTouch === "resistance") b.push("@KC");
  if (s.rsiZone === "oversold") b.push("quá bán");
  if (s.rsiZone === "overbought") b.push("quá mua");
  if (s.newHigh) b.push("New High");
  if (s.newLow) b.push("New Low");
  if (s.ichimoku === "good") b.push("Ichi✓");
  if (s.ichimoku === "bad") b.push("Ichi✗");
  if (s.divergence === "bullish") b.push("Phân kỳ+");
  if (s.divergence === "hidden-bullish") b.push("PK ẩn+");
  if (s.divergence === "bearish") b.push("Phân kỳ−");
  if (s.divergence === "hidden-bearish") b.push("PK ẩn−");
  return b.join(" · ") || "—";
}

function bbBadges(r: ScreenerRow): string {
  const b = r.blackbox;
  const parts = [bbStatusLabel(b.bbStatus)];
  if (b.uonLen) parts.push("Uốn↑");
  if (b.uonXuong) parts.push("Uốn↓");
  if (b.tienVaoPhien > 0) parts.push(`Tiền vào ${b.tienVaoPhien}p`);
  if (b.tocDoUp) parts.push("Tốc độ+");
  return parts.join(" · ");
}

function bbStatusLabel(s: ScreenerRow["blackbox"]["bbStatus"]): string {
  return s === "tien-khoe"
    ? "Tiền khỏe"
    : s === "bao-hoa"
      ? "Bão hòa"
      : s === "tien-yeu"
        ? "Tiền yếu"
        : "Duy trì";
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const modalStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border-solid)",
  borderRadius: 8,
  width: "min(1200px, 96vw)",
  height: "88vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
};
const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border-color)",
  flexShrink: 0,
};
const chipRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderBottom: "1px solid var(--border-color)",
  flexWrap: "wrap",
};
const bodyStyle: React.CSSProperties = { overflow: "auto", flex: 1 };
const footerStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  padding: "6px 16px",
  borderTop: "1px solid var(--border-color)",
  flexShrink: 0,
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  position: "sticky",
  top: 0,
  background: "var(--bg-panel-solid)",
  color: "var(--text-muted)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border-solid)",
};
const trStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--border-color)",
  cursor: "pointer",
};
const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  color: "var(--text-main)",
};
const tdNumStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const selectStyle: React.CSSProperties = {
  fontSize: 11,
  background: "var(--bg-panel-solid)",
  color: "var(--text-main)",
  border: "1px solid var(--border-solid)",
  borderRadius: 4,
  padding: "4px 6px",
};
const refreshBtnStyle: React.CSSProperties = {
  fontSize: 11,
  background: "transparent",
  border: "1px solid var(--border-solid)",
  borderRadius: 4,
  color: "var(--text-muted)",
  padding: "4px 10px",
  cursor: "pointer",
};
const closeStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 14,
  padding: 4,
};
const chipStyle: React.CSSProperties = {
  fontSize: 11,
  background: "transparent",
  border: "1px solid var(--border-solid)",
  borderRadius: 12,
  color: "var(--text-muted)",
  padding: "3px 10px",
  cursor: "pointer",
};
const chipActiveStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "#000",
  borderColor: "var(--accent)",
  fontWeight: 600,
};
const emptyStyle: React.CSSProperties = {
  padding: 24,
  fontSize: 12,
  color: "var(--text-muted)",
};
