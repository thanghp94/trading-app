import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type HistogramData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IntradayCandle } from "./TickerDetailPanel.js";

interface Props {
  candles: IntradayCandle[] | null;
}

export function TickerVolumePerMin({ candles }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Effect 1: mount/unmount chart once
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

    seriesRef.current = chart.addSeries(HistogramSeries, {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "right",
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

  // Effect 2: data updates
  useEffect(() => {
    if (!seriesRef.current || !candles) return;
    const data: HistogramData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? "#26a69a" : "#ef5350",
    }));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ fontSize: 10, color: "#666", padding: "4px 8px" }}>
        KL/phút
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
