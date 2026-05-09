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

interface ChartProps {
  candles: Candle[];
  zones?: Zone[];
  htfZones?: Zone[];
  waves?: WaveCount[];
  emas?: EmaSeries[];
}

const DARK_THEME = {
  layout: { background: { color: '#0d1117' }, textColor: '#c9d1d9' },
  grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
  rightPriceScale: { borderColor: '#30363d' },
  timeScale: { borderColor: '#30363d', timeVisible: true, secondsVisible: false },
};

const UP = '#26a69a';
const DOWN = '#ef5350';

export function Chart({ candles, zones = [], htfZones = [], waves = [], emas = [] }: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const zonePrimitiveRef = useRef<ZonePrimitive | null>(null);
  const htfZonePrimitiveRef = useRef<ZonePrimitive | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const emaSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map());

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

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      zonePrimitiveRef.current = null;
      htfZonePrimitiveRef.current = null;
      markersRef.current = null;
      emaSeriesRef.current.clear();
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
