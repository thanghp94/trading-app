import { useEffect, useRef } from 'react';
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
} from 'lightweight-charts';
import type { Candle, Zone } from '../../shared/types.js';
import type { WaveCount } from '../../shared/indicators/wave-counter.js';
import type { EmaSeries } from '../use-emas.js';
import { ZonePrimitive } from './zone-primitive.js';
import { crosshairBus } from '../crosshair-bus.js';
import { clickBus } from '../click-bus.js';

interface ChartProps {
  candles: Candle[];
  zones?: Zone[];
  htfZones?: Zone[];
  waves?: WaveCount[];
  emas?: EmaSeries[];
  /** Symbol the cell shows. Used to filter click-sync events between cells. */
  symbol?: string;
}

const DARK_THEME = {
  layout: { background: { color: '#0d1117' }, textColor: '#c9d1d9' },
  grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
  rightPriceScale: { borderColor: '#30363d' },
  timeScale: { borderColor: '#30363d', timeVisible: true, secondsVisible: false },
};

const UP = '#26a69a';
const DOWN = '#ef5350';

export function Chart({ candles, zones = [], htfZones = [], waves = [], emas = [], symbol = '' }: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const zonePrimitiveRef = useRef<ZonePrimitive | null>(null);
  const htfZonePrimitiveRef = useRef<ZonePrimitive | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const emaSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map());
  const waveLineSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const symbolRef = useRef<string>(symbol);
  const candleStrideSeconds = useRef<number>(60);
  // Keep refs current for the chart-init effect closure (which only runs once).
  symbolRef.current = symbol;
  if (candles.length >= 2) {
    const stride = candles[candles.length - 1].time - candles[candles.length - 2].time;
    if (stride > 0) candleStrideSeconds.current = stride;
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, { ...DARK_THEME, autoSize: true });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    const zonePrimitive = new ZonePrimitive();
    candleSeries.attachPrimitive(zonePrimitive);
    const htfZonePrimitive = new ZonePrimitive();
    candleSeries.attachPrimitive(htfZonePrimitive);

    const markers = createSeriesMarkers(candleSeries, []);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    zonePrimitiveRef.current = zonePrimitive;
    htfZonePrimitiveRef.current = htfZonePrimitive;
    markersRef.current = markers;

    // Crosshair sync: when this chart's crosshair moves, broadcast the
    // bar time. When another chart broadcasts, place our crosshair to
    // match. The `selfMoving` ref breaks the loop so we don't echo our
    // own publishes back into ourselves.
    let selfMoving = false;
    const onCrosshair = (param: { time?: number | string | null | unknown }) => {
      if (selfMoving) return;
      const raw = param.time;
      const t = typeof raw === 'number' ? raw : null;
      crosshairBus.publish(t);
    };
    chart.subscribeCrosshairMove(onCrosshair as never);

    // Click sync: publish on click; subscribe to reposition when another
    // cell with the SAME symbol publishes. Different-symbol cells ignore.
    let selfClicking = false;
    const onClick = (param: { time?: number | string | null | unknown }) => {
      if (selfClicking) return;
      const raw = param.time;
      const t = typeof raw === 'number' ? raw : null;
      if (t != null && symbolRef.current) clickBus.publish(t, symbolRef.current);
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
          chart.setCrosshairPosition(NaN, time as never, candleSeriesRef.current);
        }
      } catch {
        /* outside this chart's range — ignore */
      } finally {
        selfMoving = false;
      }
    });

    return () => {
      try { chart.unsubscribeCrosshairMove(onCrosshair as never); } catch { /* already removed */ }
      try { chart.unsubscribeClick(onClick as never); } catch { /* already removed */ }
      unsubBus();
      unsubClickBus();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      zonePrimitiveRef.current = null;
      htfZonePrimitiveRef.current = null;
      markersRef.current = null;
      emaSeriesRef.current.clear();
      waveLineSeriesRef.current.clear();
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
        try { chart.removeSeries(series); } catch { /* already gone */ }
        waveLineSeriesRef.current.delete(id);
      }
    }
    for (const w of waves) {
      const completed = w.resetReason === 'completed';
      const reset = !w.active && !completed;
      const color = completed ? '#26a69a' : reset ? '#6e7681' : '#d4a72c';
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

function wavesToMarkers(waves: WaveCount[]): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];
  for (const w of waves) {
    const completed = w.resetReason === 'completed';
    const reset = !w.active && !completed;
    const color = completed ? '#26a69a' : reset ? '#6e7681' : '#d4a72c';
    for (const p of w.points) {
      const isHighSide = w.direction === 'bull' ? p.label % 2 === 0 : p.label % 2 === 1;
      markers.push({
        time: p.time as Time,
        position: isHighSide ? 'aboveBar' : 'belowBar',
        color,
        shape: 'circle',
        text: String(p.label),
      });
    }
  }
  markers.sort((a, b) => (a.time as number) - (b.time as number));
  return markers;
}
