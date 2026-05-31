import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type UTCTimestamp,
} from "lightweight-charts";

export interface LiquidityPoint {
  time: UTCTimestamp;
  cumVol: number;
}

interface Props {
  today: LiquidityPoint[] | null;
  yesterday: LiquidityPoint[] | null;
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

export function MarketLiquidity({ today, yesterday }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const todayRef = useRef<ISeriesApi<"Area"> | null>(null);
  const yestRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Effect 1: mount/unmount only — create chart + series once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#888",
      },
      grid: {
        vertLines: { color: "#1e1e1e" },
        horzLines: { color: "#1e1e1e" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#333" },
      timeScale: {
        borderColor: "#333",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    todayRef.current = chart.addSeries(AreaSeries, {
      lineColor: "#26a69a",
      topColor: "rgba(38,166,154,0.25)",
      bottomColor: "rgba(38,166,154,0.02)",
      lineWidth: 2,
    });

    yestRef.current = chart.addSeries(AreaSeries, {
      lineColor: "#ef5350",
      topColor: "rgba(239,83,80,0.08)",
      bottomColor: "rgba(239,83,80,0.0)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
    });

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      todayRef.current = null;
      yestRef.current = null;
    };
  }, []);

  // Effect 2: data updates — no chart teardown, just setData
  useEffect(() => {
    if (!chartRef.current) return;
    if (today && today.length > 0) {
      const data: AreaData[] = today.map((p) => ({
        time: p.time,
        value: p.cumVol,
      }));
      todayRef.current?.setData(data);
    }
    if (yesterday && yesterday.length > 0) {
      const data: AreaData[] = yesterday.map((p) => ({
        time: p.time,
        value: p.cumVol,
      }));
      yestRef.current?.setData(data);
    }
    chartRef.current.timeScale().fitContent();
  }, [today, yesterday]);

  const latestToday = today?.at(-1)?.cumVol ?? 0;
  const latestYesterday = yesterday?.at(-1)?.cumVol ?? 0;
  const ratio = latestYesterday > 0 ? latestToday / latestYesterday : null;

  if (!today && !yesterday) {
    return (
      <div style={{ padding: 12 }}>
        <div
          className="animate-pulse"
          style={{ height: 260, background: "#1e1e1e", borderRadius: 4 }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "8px 12px",
          fontSize: 11,
          color: "#aaa",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        <span style={{ color: "#26a69a" }}>
          ── Hôm nay: {fmtVol(latestToday)}
        </span>
        <span style={{ color: "#ef5350" }}>
          - - Hôm qua: {fmtVol(latestYesterday)}
        </span>
        {ratio !== null && (
          <span style={{ color: ratio >= 1 ? "#4caf50" : "#ef5350" }}>
            {ratio >= 1 ? "+" : ""}
            {((ratio - 1) * 100).toFixed(1)}% so với hôm qua
          </span>
        )}
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 260 }} />
    </div>
  );
}
