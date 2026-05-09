import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, Zone } from '../../shared/types.js';
import { ZonePrimitive } from './zone-primitive.js';

interface ChartProps {
  candles: Candle[];
  zones?: Zone[];
}

const DARK_THEME = {
  layout: { background: { color: '#0d1117' }, textColor: '#c9d1d9' },
  grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
  rightPriceScale: { borderColor: '#30363d' },
  timeScale: { borderColor: '#30363d', timeVisible: true, secondsVisible: false },
};

const UP = '#26a69a';
const DOWN = '#ef5350';

export function Chart({ candles, zones = [] }: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const zonePrimitiveRef = useRef<ZonePrimitive | null>(null);

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

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    zonePrimitiveRef.current = zonePrimitive;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      zonePrimitiveRef.current = null;
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
