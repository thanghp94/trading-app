import { useEffect, useRef } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type HistogramData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Zone } from '../../shared/types.js';
import type { WaveCount } from '../../shared/indicators/wave-counter.js';
import { ZonePrimitive } from './zone-primitive.js';

interface ChartProps {
  candles: Candle[];
  zones?: Zone[];
  waves?: WaveCount[];
}

const DARK_THEME = {
  layout: { background: { color: '#0d1117' }, textColor: '#c9d1d9' },
  grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
  rightPriceScale: { borderColor: '#30363d' },
  timeScale: { borderColor: '#30363d', timeVisible: true, secondsVisible: false },
};

const UP = '#26a69a';
const DOWN = '#ef5350';

export function Chart({ candles, zones = [], waves = [] }: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const zonePrimitiveRef = useRef<ZonePrimitive | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

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

    const markers = createSeriesMarkers(candleSeries, []);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    zonePrimitiveRef.current = zonePrimitive;
    markersRef.current = markers;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      zonePrimitiveRef.current = null;
      markersRef.current = null;
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
    if (!markersRef.current) return;
    const markers = wavesToMarkers(waves);
    markersRef.current.setMarkers(markers);
  }, [waves]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

/**
 * Convert wave counts to lightweight-charts markers.
 *
 * For each wave point we drop a labeled circle on the bar. Bull setups put
 * even-labeled points (0, 2, 4 = highs) above the bar and odd-labeled
 * points (1, 3, 5 = lows) below; bear is mirrored.
 *
 * Reset / completion state colors the marker:
 *   - active count → yellow markers
 *   - completed (hit point 5) → green markers
 *   - reset (any reason) → gray markers
 */
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
  // Markers must be sorted by time ascending for lightweight-charts.
  markers.sort((a, b) => (a.time as number) - (b.time as number));
  return markers;
}
