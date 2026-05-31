import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Zone } from "../../shared/types.js";
import type { WaveCount } from "../../shared/indicators/wave-counter.js";
import type { EmaSeries } from "../use-emas.js";
import type { BollingerBands } from "../use-bollinger.js";
import { ZonePrimitive } from "./zone-primitive.js";
import { HeatmapPrimitive } from "./heatmap-primitive.js";
import { crosshairBus } from "../crosshair-bus.js";
import { clickBus } from "../click-bus.js";
import { chartRegistry } from "../chart-registry.js";
import type { TradeRow } from "../use-journal.js";
import { type IPriceLine } from "lightweight-charts";

interface ChartProps {
  candles: Candle[];
  zones?: Zone[];
  htfZones?: Zone[];
  waves?: WaveCount[];
  emas?: EmaSeries[];
  bollinger?: BollingerBands | null;
  rsi?: number[] | null;
  /** Cell id — registers this chart in chartRegistry for screenshot capture. */
  id?: string;
  /** Symbol the cell shows. Used to filter click-sync events between cells. */
  symbol?: string;
  openTrades?: TradeRow[];
  depth?: import("../../shared/types.js").DepthSnapshot | null;
  /** Called when user clicks a bar. Receives the bar's UTC timestamp. */
  onBarClick?: (time: number) => void;
}

const DARK_THEME = {
  layout: {
    background: { color: "#0d1117" },
    textColor: "#c9d1d9",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    fontSize: 13,
  },
  grid: { vertLines: { color: "#161b22" }, horzLines: { color: "#161b22" } },
  rightPriceScale: { borderColor: "#30363d" },
  timeScale: {
    borderColor: "#30363d",
    timeVisible: true,
    secondsVisible: false,
  },
};

const UP = "#26a69a";
const DOWN = "#ef5350";

export function Chart({
  candles,
  zones = [],
  htfZones = [],
  waves = [],
  emas = [],
  bollinger = null,
  rsi = null,
  id = "",
  symbol = "",
  openTrades,
  depth,
  onBarClick,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Stable ref so subscribeClick closure never goes stale
  const onBarClickRef = useRef(onBarClick);
  useEffect(() => {
    onBarClickRef.current = onBarClick;
  }, [onBarClick]);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const zonePrimitiveRef = useRef<ZonePrimitive | null>(null);
  const heatmapPrimitiveRef = useRef<HeatmapPrimitive | null>(null);
  const htfZonePrimitiveRef = useRef<ZonePrimitive | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const emaSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const waveLineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const tradeLinesRef = useRef<IPriceLine[]>([]);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiContainerRef = useRef<HTMLDivElement | null>(null);
  const symbolRef = useRef<string>(symbol);
  const candleStrideSeconds = useRef<number>(60);

  // Ruler tool — 📏 button/R key toggles sticky mode; Shift+drag works anytime
  const rulerModeRef = useRef(false);
  const [rulerMode, setRulerMode] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const rulerDragStart = useRef<{ x: number; y: number; price: number } | null>(
    null,
  );
  const [rulerBox, setRulerBox] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    price1: number;
    price2: number;
  } | null>(null);
  const setRulerBoxRef = useRef(setRulerBox);
  setRulerBoxRef.current = setRulerBox;
  const rulerBoxRef = useRef(rulerBox);
  rulerBoxRef.current = rulerBox;
  // Keep refs current for the chart-init effect closure (which only runs once).
  symbolRef.current = symbol;
  if (candles.length >= 2) {
    const stride =
      candles[candles.length - 1].time - candles[candles.length - 2].time;
    if (stride > 0) candleStrideSeconds.current = stride;
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...DARK_THEME,
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candleSeries
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart
      .priceScale("volume")
      .applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    const zonePrimitive = new ZonePrimitive();
    candleSeries.attachPrimitive(zonePrimitive);
    const htfZonePrimitive = new ZonePrimitive();
    candleSeries.attachPrimitive(htfZonePrimitive);
    const heatmap = new HeatmapPrimitive();
    candleSeries.attachPrimitive(heatmap);

    const markers = createSeriesMarkers(candleSeries, []);

    chartRef.current = chart;
    if (id) chartRegistry.register(id, { chart, rsiChart: null });
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    zonePrimitiveRef.current = zonePrimitive;
    htfZonePrimitiveRef.current = htfZonePrimitive;
    heatmapPrimitiveRef.current = heatmap;
    markersRef.current = markers;

    // Crosshair sync: when this chart's crosshair moves, broadcast the
    // bar time. When another chart broadcasts, place our crosshair to
    // match. The `selfMoving` ref breaks the loop so we don't echo our
    // own publishes back into ourselves.
    let selfMoving = false;
    const onCrosshair = (param: {
      time?: number | string | null | unknown;
    }) => {
      if (selfMoving) return;
      const raw = param.time;
      const t = typeof raw === "number" ? raw : null;
      crosshairBus.publish(t);
    };
    chart.subscribeCrosshairMove(onCrosshair as never);

    // Click sync: double-click to reposition; single click is ignored so
    // accidental clicks don't yank the visible range.
    let selfClicking = false;
    let lastClickTime = 0;
    const DBLCLICK_MS = 400;
    const onClick = (param: { time?: number | string | null | unknown }) => {
      if (selfClicking) return;
      const raw = param.time;
      const t = typeof raw === "number" ? raw : null;
      const now = Date.now();
      if (now - lastClickTime < DBLCLICK_MS) {
        // Double-click — reposition + enter replay
        lastClickTime = 0;
        setRulerBoxRef.current(null);
        if (t != null && symbolRef.current)
          clickBus.publish(t, symbolRef.current);
        if (t != null) onBarClickRef.current?.(t);
      } else {
        lastClickTime = now;
      }
    };
    chart.subscribeClick(onClick as never);
    const unsubClickBus = clickBus.subscribe((time, sym) => {
      if (sym !== symbolRef.current) return;
      selfClicking = true;
      try {
        // Center the visible range on the clicked time (~50 bars on either side).
        const stride = candleStrideSeconds.current;
        const span = stride * 100;
        chart.timeScale().setVisibleRange({
          from: (time - span / 2) as Time,
          to: (time + span / 2) as Time,
        });
      } catch {
        /* time outside loaded range — ignore */
      } finally {
        selfClicking = false;
      }
    });
    const unsubBus = crosshairBus.subscribe((time) => {
      if (!candleSeriesRef.current) return;
      selfMoving = true;
      try {
        if (time == null) {
          chart.clearCrosshairPosition();
        } else {
          chart.setCrosshairPosition(
            NaN,
            time as never,
            candleSeriesRef.current,
          );
        }
      } catch {
        /* outside this chart's range — ignore */
      } finally {
        selfMoving = false;
      }
    });

    return () => {
      try {
        chart.unsubscribeCrosshairMove(onCrosshair as never);
      } catch {
        /* already removed */
      }
      try {
        chart.unsubscribeClick(onClick as never);
      } catch {
        /* already removed */
      }
      unsubBus();
      unsubClickBus();
      if (id) chartRegistry.unregister(id);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      zonePrimitiveRef.current = null;
      heatmapPrimitiveRef.current = null;
      htfZonePrimitiveRef.current = null;
      markersRef.current = null;
      emaSeriesRef.current.clear();
      waveLineSeriesRef.current.clear();
      tradeLinesRef.current = [];
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
      rsiSeriesRef.current = null;
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    const ohlc: CandlestickData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volume: HistogramData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? `${UP}88` : `${DOWN}88`,
    }));
    candleSeriesRef.current.setData(ohlc);
    volumeSeriesRef.current.setData(volume);
  }, [candles]);

  useEffect(() => {
    zonePrimitiveRef.current?.setZones(zones);
  }, [zones]);

  useEffect(() => {
    heatmapPrimitiveRef.current?.setDepth(depth || null);
  }, [depth]);

  useEffect(() => {
    htfZonePrimitiveRef.current?.setZones(htfZones);
  }, [htfZones]);

  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.setMarkers(wavesToMarkers(waves));
  }, [waves]);

  // Wave zigzag lines — one LineSeries per active wave count, connecting
  // points 0→1→2→3→4→5. Color reflects state (yellow active, green completed,
  // gray reset). Mirrors the manual yellow zigzag from the user's screenshots.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const present = new Set(waves.map((w) => w.id));
    // Drop series whose wave count no longer exists.
    for (const [id, series] of waveLineSeriesRef.current.entries()) {
      if (!present.has(id)) {
        try {
          chart.removeSeries(series);
        } catch {
          /* already gone */
        }
        waveLineSeriesRef.current.delete(id);
      }
    }
    for (const w of waves) {
      const completed = w.resetReason === "completed";
      const reset = !w.active && !completed;
      const color = completed ? "#26a69a" : reset ? "#6e7681" : "#d4a72c";
      let series = waveLineSeriesRef.current.get(w.id);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: 0, // solid
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        waveLineSeriesRef.current.set(w.id, series);
      } else {
        series.applyOptions({ color });
      }
      const data: LineData[] = w.points
        .slice()
        .sort((a, b) => a.time - b.time)
        .map((p) => ({ time: p.time as UTCTimestamp, value: p.price }));
      series.setData(data);
    }
  }, [waves]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const present = new Set(emas.map((e) => e.period));
    // Remove series for periods no longer in the list.
    for (const [period, series] of emaSeriesRef.current.entries()) {
      if (!present.has(period)) {
        chart.removeSeries(series);
        emaSeriesRef.current.delete(period);
      }
    }
    // Add or update series for each requested EMA.
    for (const e of emas) {
      let series = emaSeriesRef.current.get(e.period);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: e.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: `EMA ${e.period}`,
        });
        emaSeriesRef.current.set(e.period, series);
      }
      const data: LineData[] = [];
      for (let i = 0; i < candles.length; i += 1) {
        const v = e.values[i];
        if (Number.isFinite(v)) {
          data.push({ time: candles[i].time as UTCTimestamp, value: v });
        }
      }
      series.setData(data);
    }
  }, [emas, candles]);

  // Render open trades as price lines
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear existing
    tradeLinesRef.current.forEach((line) => series.removePriceLine(line));
    tradeLinesRef.current = [];

    if (!openTrades) return;

    for (const trade of openTrades) {
      const isBull = trade.direction === "bull";
      const colorEntry = isBull ? "#26a69a" : "#ef5350";

      // Entry Line
      tradeLinesRef.current.push(
        series.createPriceLine({
          price: trade.entry_price,
          color: colorEntry,
          lineWidth: 2,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: `${trade.direction.toUpperCase()} ENTRY`,
        }),
      );

      // SL Line
      if (trade.sl != null) {
        tradeLinesRef.current.push(
          series.createPriceLine({
            price: trade.sl,
            color: "#f85149",
            lineWidth: 2,
            lineStyle: 1, // dotted
            axisLabelVisible: true,
            title: "SL",
          }),
        );
      }

      // TP Line
      if (trade.tp != null) {
        tradeLinesRef.current.push(
          series.createPriceLine({
            price: trade.tp,
            color: "#2ea043",
            lineWidth: 2,
            lineStyle: 1, // dotted
            axisLabelVisible: true,
            title: "TP",
          }),
        );
      }
    }
  }, [openTrades]);

  // Bollinger Bands overlay
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!bollinger) {
      if (bbUpperRef.current) {
        try {
          chart.removeSeries(bbUpperRef.current);
        } catch {
          /* gone */
        }
        bbUpperRef.current = null;
      }
      if (bbMiddleRef.current) {
        try {
          chart.removeSeries(bbMiddleRef.current);
        } catch {
          /* gone */
        }
        bbMiddleRef.current = null;
      }
      if (bbLowerRef.current) {
        try {
          chart.removeSeries(bbLowerRef.current);
        } catch {
          /* gone */
        }
        bbLowerRef.current = null;
      }
      return;
    }
    const baseOpts = {
      lineWidth: 1 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };
    if (!bbUpperRef.current)
      bbUpperRef.current = chart.addSeries(LineSeries, {
        ...baseOpts,
        color: "#4dabf7",
      });
    if (!bbMiddleRef.current)
      bbMiddleRef.current = chart.addSeries(LineSeries, {
        ...baseOpts,
        color: "#74c0fc",
        lineStyle: 1,
      });
    if (!bbLowerRef.current)
      bbLowerRef.current = chart.addSeries(LineSeries, {
        ...baseOpts,
        color: "#4dabf7",
      });
    const toLD = (vals: number[]): LineData[] =>
      candles
        .map((c, i) => ({ time: c.time as UTCTimestamp, value: vals[i] }))
        .filter((d) => Number.isFinite(d.value));
    bbUpperRef.current.setData(toLD(bollinger.upper));
    bbMiddleRef.current.setData(toLD(bollinger.middle));
    bbLowerRef.current.setData(toLD(bollinger.lower));
  }, [bollinger, candles]);

  // RSI sub-chart (separate lightweight-charts instance rendered below)
  useEffect(() => {
    if (!rsiContainerRef.current) return;
    if (!rsi) {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
        if (id) chartRegistry.update(id, { rsiChart: null });
      }
      return;
    }
    if (!rsiChartRef.current) {
      const rc = createChart(rsiContainerRef.current, {
        ...DARK_THEME,
        autoSize: true,
        timeScale: { visible: false },
        rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      const rs = rc.addSeries(LineSeries, {
        color: "#a78bfa",
        lineWidth: 1 as const,
        priceLineVisible: false,
        lastValueVisible: true,
        title: "RSI",
      });
      rs.createPriceLine({
        price: 70,
        color: "#ef535066",
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: false,
      });
      rs.createPriceLine({
        price: 30,
        color: "#26a69a66",
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: false,
      });
      rs.createPriceLine({
        price: 50,
        color: "#44556688",
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: false,
      });
      rsiChartRef.current = rc;
      rsiSeriesRef.current = rs;
      if (id) chartRegistry.update(id, { rsiChart: rc });
    }
    const data: LineData[] = candles
      .map((c, i) => ({ time: c.time as UTCTimestamp, value: rsi[i] }))
      .filter((d) => Number.isFinite(d.value));
    rsiSeriesRef.current?.setData(data);
    rsiChartRef.current?.timeScale().fitContent();
  }, [rsi, candles]);

  // Ruler: R key or 📏 button toggles sticky mode; Shift+drag works anytime
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
      if (e.key === "r" || e.key === "R") {
        const next = !rulerModeRef.current;
        rulerModeRef.current = next;
        setRulerMode(next);
        if (!next) {
          rulerDragStart.current = null;
          setRulerBox(null);
        }
      }
      if (e.key === "Escape") {
        rulerDragStart.current = null;
        setRulerBox(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftHeld(false);
        rulerDragStart.current = null;
      }
    };
    // Any non-shift mousedown clears the measurement box
    const mousedown = (e: MouseEvent) => {
      if (!e.shiftKey && !rulerModeRef.current && rulerBoxRef.current) {
        setRulerBoxRef.current(null);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousedown", mousedown);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousedown", mousedown);
    };
  }, []);

  // Overlay active when ruler mode is on OR Shift is held
  const overlayActive = rulerMode || shiftHeld;

  const handleRulerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const y = e.nativeEvent.offsetY;
    const price = candleSeriesRef.current?.coordinateToPrice(y) ?? null;
    if (price == null) return;
    rulerDragStart.current = { x: e.nativeEvent.offsetX, y, price };
    setRulerBox(null);
  };

  const handleRulerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const start = rulerDragStart.current;
    if (!start || !(e.buttons & 1)) return;
    const y = e.nativeEvent.offsetY;
    const price2 = candleSeriesRef.current?.coordinateToPrice(y) ?? null;
    if (price2 == null) return;
    setRulerBox({
      x1: start.x,
      y1: start.y,
      x2: e.nativeEvent.offsetX,
      y2: y,
      price1: start.price,
      price2,
    });
  };

  const handleRulerUp = (e: React.MouseEvent<HTMLDivElement>) => {
    const start = rulerDragStart.current;
    rulerDragStart.current = null;
    // If mouse barely moved it was a click, not a drag — clear box
    if (start) {
      const dx = e.nativeEvent.offsetX - start.x;
      const dy = e.nativeEvent.offsetY - start.y;
      if (dx * dx + dy * dy < 25) setRulerBox(null);
    }
  };

  const rb = rulerBox;
  const rbPct = rb ? ((rb.price2 - rb.price1) / rb.price1) * 100 : 0;
  const rbUp = rb ? rb.price2 >= rb.price1 : true;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Overlay — active in ruler mode or while Shift held */}
        {overlayActive && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              cursor: "crosshair",
              zIndex: 5,
            }}
            onMouseDown={handleRulerDown}
            onMouseMove={handleRulerMove}
            onMouseUp={handleRulerUp}
            onMouseLeave={handleRulerUp}
          />
        )}

        {/* Measurement box */}
        {rb && (
          <div
            style={{
              position: "absolute",
              left: Math.min(rb.x1, rb.x2),
              top: Math.min(rb.y1, rb.y2),
              width: Math.abs(rb.x2 - rb.x1),
              height: Math.abs(rb.y2 - rb.y1),
              background: rbUp ? "#26a69a18" : "#ef535018",
              border: `1px solid ${rbUp ? "#26a69a" : "#ef5350"}`,
              pointerEvents: "none",
              zIndex: 6,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: rbUp ? "#26a69acc" : "#ef5350cc",
                color: "#fff",
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 13,
                fontFamily: "monospace",
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}
            >
              {rbPct >= 0 ? "+" : ""}
              {rbPct.toFixed(2)}%
            </div>
          </div>
        )}

        {/* 📏 toggle button */}
        <button
          type="button"
          title="Ruler — toggle sticky mode (R) · or Shift+drag anytime"
          onClick={() => {
            const next = !rulerModeRef.current;
            rulerModeRef.current = next;
            setRulerMode(next);
            if (!next) {
              rulerDragStart.current = null;
              setRulerBox(null);
            }
          }}
          style={{
            position: "absolute",
            top: 8,
            right: 60,
            zIndex: 10,
            background: rulerMode ? "#d4a72c22" : "#21262d",
            border: `1px solid ${rulerMode ? "#d4a72c" : "#30363d"}`,
            color: rulerMode ? "#d4a72c" : "#8b949e",
            padding: "2px 7px",
            borderRadius: 4,
            fontSize: 12,
            cursor: "pointer",
            lineHeight: "18px",
          }}
        >
          📏
        </button>
      </div>

      {/* Always in DOM so rsiContainerRef stays stable — height 0 hides it */}
      <div
        ref={rsiContainerRef}
        style={{
          height: rsi ? 100 : 0,
          overflow: "hidden",
          borderTop: rsi ? "1px solid #30363d" : undefined,
        }}
      />
    </div>
  );
}

function wavesToMarkers(waves: WaveCount[]): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];
  for (const w of waves) {
    const completed = w.resetReason === "completed";
    const reset = !w.active && !completed;
    const color = completed ? "#26a69a" : reset ? "#6e7681" : "#d4a72c";
    for (const p of w.points) {
      // Even labels (0, 2, 4) are HIGH side for both BULL and BEAR.
      const isHighSide = p.label % 2 === 0;
      markers.push({
        time: p.time as Time,
        position: isHighSide ? "aboveBar" : "belowBar",
        color,
        shape: "circle",
        text: String(p.label),
      });
    }
  }
  markers.sort((a, b) => (a.time as number) - (b.time as number));
  return markers;
}
