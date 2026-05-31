import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IntradayCandle } from "./TickerDetailPanel.js";

interface Props {
  candles: IntradayCandle[] | null;
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

export function TickerCumVolume({ candles }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Effect 1: mount/unmount once
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

    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: "#26a69a",
      topColor: "rgba(38,166,154,0.25)",
      bottomColor: "rgba(38,166,154,0.02)",
      lineWidth: 2,
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
      seriesRef.current = null;
    };
  }, []);

  // Effect 2: data updates only
  useEffect(() => {
    if (!seriesRef.current || !candles) return;
    let cum = 0;
    const data: AreaData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: (cum += c.volume),
    }));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  const totalVol = candles?.reduce((s, c) => s + c.volume, 0) ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 8px",
        }}
      >
        <span style={{ fontSize: 10, color: "#666" }}>Khối lượng tích lũy</span>
        <span
          style={{ fontSize: 10, color: "#26a69a", fontFamily: "monospace" }}
        >
          {totalVol > 0 ? `Tổng: ${fmtVol(totalVol)}` : ""}
        </span>
      </div>
      {/* containerRef always mounts so Effect 1 can create the chart on first render */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 120, position: "relative" }}
      >
        {!candles && (
          <div
            className="animate-pulse"
            style={{
              position: "absolute",
              inset: 4,
              background: "#1e1e1e",
              borderRadius: 4,
            }}
          />
        )}
      </div>
    </div>
  );
}
