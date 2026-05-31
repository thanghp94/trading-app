import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

// ── Local types (mirrors server types) ──

type Horizon = 3 | 5 | 10 | 20 | 60 | 180;
type ByHorizon = Record<Horizon, number | null>;

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

// ── Constants ──

const HORIZONS: Horizon[] = [3, 5, 10, 20, 60, 180];
const MAX_MARKERS = 300;

// ── Main component ──

interface SignalStudyDetailProps {
  symbol: string;
  detail: SignalDetail;
  closes: number[];
  volumes: number[];
  times: number[]; // unix seconds
  onClose: () => void;
}

export function SignalStudyDetail({
  symbol,
  detail,
  closes,
  volumes,
  times,
  onClose,
}: SignalStudyDetailProps) {
  // Derive win-prob high/low from winByHorizon
  const nonNullWin = HORIZONS.map((h) => detail.winByHorizon[h]).filter(
    (v): v is number => v !== null,
  );
  const winMax = nonNullWin.length ? Math.max(...nonNullWin) : null;
  const winMin = nonNullWin.length ? Math.min(...nonNullWin) : null;
  const winMaxH =
    winMax !== null
      ? (HORIZONS.find((h) => detail.winByHorizon[h] === winMax) ?? null)
      : null;
  const winMinH =
    winMin !== null
      ? (HORIZONS.find((h) => detail.winByHorizon[h] === winMin) ?? null)
      : null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#c9d1d9" }}>
            {symbol}{" "}
            <span style={{ color: "#8b949e", fontWeight: 400 }}>|</span>{" "}
            {detail.labelVi}
          </span>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div style={bodyStyle}>
          {/* Chart */}
          <SignalChart
            closes={closes}
            volumes={volumes}
            times={times}
            eventIdx={detail.eventIdx}
          />

          {/* Two-column stats */}
          <div style={twoColStyle}>
            {/* Left: avg return stats */}
            <AvgReturnCol detail={detail} />
            {/* Right: win-prob stats + donut */}
            <WinProbCol
              detail={detail}
              winMax={winMax}
              winMin={winMin}
              winMaxH={winMaxH}
              winMinH={winMinH}
            />
          </div>

          {/* Year tables */}
          <YearTable
            title="Lợi nhuận trung bình theo thời gian nắm giữ (%)"
            rows={detail.perYearAvg}
          />
          <YearTable
            title="Xác suất có lời theo thời gian nắm giữ (%)"
            rows={detail.perYearWin}
          />
        </div>
      </div>
    </div>
  );
}

// ── Chart ──

function SignalChart({
  closes,
  volumes,
  times,
  eventIdx,
}: {
  closes: number[];
  volumes: number[];
  times: number[];
  eventIdx: number[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "#0d1117" },
        textColor: "#c9d1d9",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#161b22" },
        horzLines: { color: "#161b22" },
      },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: {
        borderColor: "#30363d",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#388bfd",
      lineWidth: 2,
      priceScaleId: "right",
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      color: "#30363d",
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const markers = createSeriesMarkers(lineSeries, []);

    chartRef.current = chart;
    lineRef.current = lineSeries;
    volRef.current = volSeries;
    markersRef.current = markers;

    return () => {
      chart.remove();
      chartRef.current = null;
      lineRef.current = null;
      volRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Set data
  useEffect(() => {
    if (!lineRef.current || !volRef.current) return;
    const lineData = times.map((t, i) => ({
      time: t as UTCTimestamp,
      value: closes[i] ?? 0,
    }));
    const volData = times.map((t, i) => ({
      time: t as UTCTimestamp,
      value: volumes[i] ?? 0,
      color: i > 0 && closes[i] >= closes[i - 1] ? "#26a69a44" : "#ef535044",
    }));
    lineRef.current.setData(lineData);
    volRef.current.setData(volData);
    chartRef.current?.timeScale().fitContent();
  }, [closes, volumes, times]);

  // Set markers
  useEffect(() => {
    if (!markersRef.current || times.length === 0) return;
    // Sample evenly if too many markers
    let indices = eventIdx;
    if (indices.length > MAX_MARKERS) {
      const step = indices.length / MAX_MARKERS;
      indices = Array.from(
        { length: MAX_MARKERS },
        (_, i) => indices[Math.round(i * step)],
      ).filter((v): v is number => v !== undefined);
    }
    const ms: SeriesMarker<Time>[] = indices
      .filter((idx) => idx >= 0 && idx < times.length)
      .map((idx) => ({
        time: times[idx] as UTCTimestamp,
        position: "belowBar" as const,
        shape: "circle" as const,
        color: "#ef5350",
        size: 1,
      }));
    ms.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current.setMarkers(ms);
  }, [eventIdx, times]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 240,
        background: "#0d1117",
        borderRadius: 3,
      }}
    />
  );
}

// ── Left stats column ──

function AvgReturnCol({ detail }: { detail: SignalDetail }) {
  const { optimalAvgHorizon, bestPeriod, worstPeriod, avgByHorizon } = detail;
  // Compute bar widths — proportional to |value|
  const nonNullVals = HORIZONS.map((h) => avgByHorizon[h]).filter(
    (v): v is number => v !== null,
  );
  const maxAbs = nonNullVals.length
    ? Math.max(...nonNullVals.map(Math.abs))
    : 1;

  return (
    <div style={statColStyle}>
      <div style={statColTitleStyle}>Thống kê biến động giá bình quân (%)</div>
      {optimalAvgHorizon !== null && (
        <StatLine
          label="Nắm giữ tối ưu"
          value={`T+${optimalAvgHorizon} ngày`}
          valueColor="#26a69a"
        />
      )}
      {bestPeriod && (
        <StatLine
          label="Biến động giá cao nhất"
          value={`+${bestPeriod.value.toFixed(1)}% (${bestPeriod.year} T+${bestPeriod.horizon})`}
          valueColor="#26a69a"
        />
      )}
      {worstPeriod && (
        <StatLine
          label="Biến động giá thấp nhất"
          value={`${worstPeriod.value.toFixed(1)}% (${worstPeriod.year} T+${worstPeriod.horizon})`}
          valueColor="#ef5350"
        />
      )}
      {/* Horizon bar list */}
      <div style={{ marginTop: 8 }}>
        {HORIZONS.map((h) => {
          const v = avgByHorizon[h];
          if (v === null) return null;
          const pct = Math.abs(v) / (maxAbs || 1);
          const barW = Math.max(2, Math.round(pct * 80));
          return (
            <div
              key={h}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
                fontSize: 10,
              }}
            >
              <span style={{ color: "#8b949e", width: 30, flexShrink: 0 }}>
                T+{h}
              </span>
              <div
                style={{
                  width: barW,
                  height: 8,
                  background: v >= 0 ? "#26a69a" : "#ef5350",
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: v >= 0 ? "#26a69a" : "#ef5350",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {v >= 0 ? "+" : ""}
                {v.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Right stats column ──

function WinProbCol({
  detail,
  winMax,
  winMin,
  winMaxH,
  winMinH,
}: {
  detail: SignalDetail;
  winMax: number | null;
  winMin: number | null;
  winMaxH: Horizon | null;
  winMinH: Horizon | null;
}) {
  const { optimalWinHorizon, donut } = detail;
  return (
    <div style={statColStyle}>
      <div style={statColTitleStyle}>Thống kê xác suất có lời (%)</div>
      {optimalWinHorizon !== null && (
        <StatLine
          label="Nắm giữ tối ưu"
          value={`T+${optimalWinHorizon} ngày`}
          valueColor="#26a69a"
        />
      )}
      {winMax !== null && winMaxH !== null && (
        <StatLine
          label="Xác suất có lời cao nhất"
          value={`${winMax.toFixed(1)}% (T+${winMaxH})`}
          valueColor="#26a69a"
        />
      )}
      {winMin !== null && winMinH !== null && (
        <StatLine
          label="Xác suất có lời thấp nhất"
          value={`${winMin.toFixed(1)}% (T+${winMinH})`}
          valueColor="#ef5350"
        />
      )}
      {/* Donut */}
      <DonutChart donut={donut} />
    </div>
  );
}

// ── Donut SVG ──

function DonutChart({
  donut,
}: {
  donut: { win: number; breakeven: number; loss: number; total: number };
}) {
  const { win, breakeven, loss, total } = donut;
  const cx = 60;
  const cy = 60;
  const r = 46;
  const strokeW = 14;

  if (total === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          color: "#6e7681",
          fontSize: 10,
          marginTop: 8,
        }}
      >
        Không đủ dữ liệu
      </div>
    );
  }

  const winPct = win / total;
  const bePct = breakeven / total;
  const lossPct = loss / total;

  // Arc helper: returns SVG path for an arc segment
  // startAngle and endAngle in radians, clockwise from top
  function arcPath(startAngle: number, endAngle: number): string {
    if (Math.abs(endAngle - startAngle) < 0.001) return "";
    const clampEnd =
      Math.abs(endAngle - startAngle) >= Math.PI * 2 - 0.001
        ? startAngle + Math.PI * 2 - 0.001
        : endAngle;
    const x1 = cx + r * Math.sin(startAngle);
    const y1 = cy - r * Math.cos(startAngle);
    const x2 = cx + r * Math.sin(clampEnd);
    const y2 = cy - r * Math.cos(clampEnd);
    const large = clampEnd - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  const TWO_PI = Math.PI * 2;
  const winEnd = winPct * TWO_PI;
  const beEnd = winEnd + bePct * TWO_PI;

  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <svg width={120} height={120} viewBox="0 0 120 120">
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#21262d"
          strokeWidth={strokeW}
        />
        {/* Win arc */}
        {winPct > 0 && (
          <path
            d={arcPath(0, winEnd)}
            fill="none"
            stroke="#26a69a"
            strokeWidth={strokeW}
            strokeLinecap="butt"
          />
        )}
        {/* Breakeven arc */}
        {bePct > 0 && (
          <path
            d={arcPath(winEnd, beEnd)}
            fill="none"
            stroke="#f0b132"
            strokeWidth={strokeW}
            strokeLinecap="butt"
          />
        )}
        {/* Loss arc */}
        {lossPct > 0 && (
          <path
            d={arcPath(beEnd, TWO_PI)}
            fill="none"
            stroke="#ef5350"
            strokeWidth={strokeW}
            strokeLinecap="butt"
          />
        )}
        {/* Center label */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize={14}
          fontWeight={700}
          fill="#c9d1d9"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize={9}
          fill="#8b949e"
        >
          Tín hiệu
        </text>
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", gap: 10, fontSize: 10, marginTop: 4 }}>
        <LegendDot
          color="#26a69a"
          label={`Lãi ${(winPct * 100).toFixed(0)}%`}
        />
        <LegendDot color="#f0b132" label={`Hòa ${(bePct * 100).toFixed(0)}%`} />
        <LegendDot
          color="#ef5350"
          label={`Lỗ ${(lossPct * 100).toFixed(0)}%`}
        />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        color: "#8b949e",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

// ── Year table ──

function YearTable({ title, rows }: { title: string; rows: PerYear[] }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={tableTitleStyle}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={ytTableStyle}>
          <thead>
            <tr>
              <th style={ytThStyle}>Năm</th>
              {HORIZONS.map((h) => (
                <th key={h} style={{ ...ytThStyle, textAlign: "right" }}>
                  T+{h}
                </th>
              ))}
              <th style={{ ...ytThStyle, textAlign: "right" }}>TB</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.year}
                style={{ background: i % 2 === 0 ? "#0d1117" : "#161b22" }}
              >
                <td style={ytTdStyle}>{row.year}</td>
                {HORIZONS.map((h) => {
                  const v = row.byHorizon[h];
                  return (
                    <td
                      key={h}
                      style={{
                        ...ytTdStyle,
                        textAlign: "right",
                        fontFamily: "ui-monospace, monospace",
                        color:
                          v === null
                            ? "#6e7681"
                            : v >= 0
                              ? "#26a69a"
                              : "#ef5350",
                      }}
                    >
                      {v === null ? "—" : v.toFixed(1)}
                    </td>
                  );
                })}
                <td
                  style={{
                    ...ytTdStyle,
                    textAlign: "right",
                    fontFamily: "ui-monospace, monospace",
                    color:
                      row.overall === null
                        ? "#6e7681"
                        : row.overall >= 0
                          ? "#26a69a"
                          : "#ef5350",
                  }}
                >
                  {row.overall === null ? "—" : row.overall.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared helpers ──

function StatLine({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 10,
        marginBottom: 4,
        gap: 8,
      }}
    >
      <span style={{ color: "#8b949e" }}>{label}</span>
      <span style={{ color: valueColor ?? "#c9d1d9", fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

// ── Styles ──

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalStyle: React.CSSProperties = {
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
  boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
  width: "min(820px, 96vw)",
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  borderBottom: "1px solid #21262d",
  background: "#161b22",
  flexShrink: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#8b949e",
  fontSize: 14,
  cursor: "pointer",
  padding: "0 4px",
  lineHeight: 1,
};

const bodyStyle: React.CSSProperties = {
  overflowY: "auto",
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 0,
  flex: 1,
};

const twoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 12,
};

const statColStyle: React.CSSProperties = {
  background: "#161b22",
  border: "1px solid #21262d",
  borderRadius: 4,
  padding: "10px 12px",
};

const statColTitleStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#8b949e",
  textTransform: "uppercase",
  marginBottom: 8,
  letterSpacing: "0.03em",
};

const tableTitleStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#c9d1d9",
  fontWeight: 600,
  marginBottom: 6,
};

const ytTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 10,
  minWidth: 420,
};

const ytThStyle: React.CSSProperties = {
  padding: "4px 6px",
  fontSize: 9,
  color: "#8b949e",
  textTransform: "uppercase",
  borderBottom: "1px solid #30363d",
  background: "#161b22",
  whiteSpace: "nowrap",
  textAlign: "left",
};

const ytTdStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid #21262d",
  whiteSpace: "nowrap",
  color: "#c9d1d9",
  fontSize: 10,
};
