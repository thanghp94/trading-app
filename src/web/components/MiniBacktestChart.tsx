import { useEffect, useRef } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../../shared/types.js';

export interface MiniTrade {
  entryIdx: number;
  exitIdx: number;
  entry: number;
  exit: number;
  sl: number;
  tp: number;
  outcome: 'win' | 'loss' | 'breakeven' | 'time-stop';
  rMultiple: number;
}

interface Props {
  candles: Candle[];
  trades: MiniTrade[];
  height?: number;
  /**
   * Replay cursor — index up to which candles are visible. Bars at
   * `[cursor..]` are hidden. When undefined, shows full history.
   * Trades whose entryIdx >= cursor are also hidden.
   */
  cursor?: number;
}

const UP = '#26a69a';
const DOWN = '#ef5350';
const BE = '#f0b132';
const TS = '#8b949e';

export function MiniBacktestChart({ candles, trades, height = 280, cursor }: Props) {
  const visibleCandles = cursor != null ? candles.slice(0, Math.max(0, Math.min(cursor, candles.length))) : candles;
  const visibleTrades = cursor != null ? trades.filter((t) => t.entryIdx < cursor) : trades;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: '#0d1117' },
        textColor: '#c9d1d9',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
      rightPriceScale: { borderColor: '#30363d' },
      timeScale: { borderColor: '#30363d', timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    const markers = createSeriesMarkers(series, []);
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = markers;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const data: CandlestickData<UTCTimestamp>[] = visibleCandles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    seriesRef.current.setData(data);
    // Only auto-fit on first paint / when bar count jumps drastically.
    // During replay step-by-step we want scale to stay stable.
    if (cursor == null) chartRef.current?.timeScale().fitContent();
  }, [visibleCandles, cursor]);

  useEffect(() => {
    if (!markersRef.current || visibleCandles.length === 0) return;
    const cutoff = cursor != null ? cursor : visibleCandles.length;
    const ms: SeriesMarker<Time>[] = [];
    for (const t of visibleTrades) {
      const entryBar = candles[t.entryIdx];
      const exitBar = candles[t.exitIdx];
      if (!entryBar) continue;
      const isBull = t.tp > t.entry;
      const color = outcomeColor(t.outcome);
      ms.push({
        time: entryBar.time as UTCTimestamp,
        position: isBull ? 'belowBar' : 'aboveBar',
        shape: isBull ? 'arrowUp' : 'arrowDown',
        color: isBull ? UP : DOWN,
        text: isBull ? 'L' : 'S',
      });
      // Only show exit marker if the trade has actually closed in the
      // visible window.
      if (exitBar && t.exitIdx < cutoff) {
        ms.push({
          time: exitBar.time as UTCTimestamp,
          position: isBull ? 'aboveBar' : 'belowBar',
          shape: 'circle',
          color,
          text: `${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple.toFixed(1)}R`,
        });
      }
    }
    ms.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current.setMarkers(ms);
  }, [visibleTrades, visibleCandles, candles, cursor]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height, background: '#0d1117', borderRadius: 3 }}
    />
  );
}

function outcomeColor(o: MiniTrade['outcome']): string {
  if (o === 'win') return UP;
  if (o === 'loss') return DOWN;
  if (o === 'breakeven') return BE;
  return TS;
}
