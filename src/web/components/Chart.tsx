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
import type { Candle } from '../../shared/types.js';

interface ChartProps {
  candles: Candle[];
}

const DARK_THEME = {
  layout: { background: { color: '#0d1117' }, textColor: '#c9d1d9' },
  grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
  rightPriceScale: { borderColor: '#30363d' },
  timeScale: { borderColor: '#30363d', timeVisible: true, secondsVisible: false },
};

const UP = '#26a69a';
const DOWN = '#ef5350';

export function Chart({ candles }: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

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
    // Reserve the bottom 25% of the pane for volume.
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume', // separate overlay price scale
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 }, // pin to bottom 22%
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
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
      color: c.close >= c.open ? `${UP}88` : `${DOWN}88`, // 88 = ~53% alpha
    }));

    candleSeriesRef.current.setData(ohlc);
    volumeSeriesRef.current.setData(volume);
  }, [candles]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
