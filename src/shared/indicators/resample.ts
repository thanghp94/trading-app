import type { Candle, Timeframe } from '../types.js';

const TF_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
};

export function tfSeconds(tf: Timeframe): number {
  return TF_SECONDS[tf];
}

/**
 * Bucket lower-timeframe candles into higher-timeframe candles.
 *
 *   resample(M5 bars, '4h') → array of 4h bars
 *
 * Bucket key = floor(bar.time / targetStride) × targetStride. Open = first
 * bar's open, close = last bar's close, high = max, low = min, volume =
 * sum. The bucket is `closed` only when its full window has passed (i.e.
 * the latest source bar starts on or after the next bucket's open time).
 *
 * Throws if `target` stride is not a multiple of source stride — the
 * caller shouldn't ask for `1m → 4h` from a 5m feed (would silently lose
 * data on bucket boundaries).
 */
export function resample(source: Candle[], target: Timeframe): Candle[] {
  if (source.length === 0) return [];
  const sourceTf = source[0].timeframe;
  const sourceStride = TF_SECONDS[sourceTf];
  const targetStride = TF_SECONDS[target];
  if (targetStride <= sourceStride) return source.map((c) => ({ ...c, timeframe: target }));
  if (targetStride % sourceStride !== 0) {
    throw new Error(`resample: target ${target} is not a clean multiple of source ${sourceTf}`);
  }

  const buckets = new Map<number, Candle>();
  for (const bar of source) {
    const bucketTime = Math.floor(bar.time / targetStride) * targetStride;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, {
        symbol: bar.symbol,
        timeframe: target,
        time: bucketTime,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        closed: false,
      });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
    }
  }

  const out = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  // Mark all but the last bucket closed — the last bucket may still be
  // accumulating fresh source bars.
  for (let i = 0; i < out.length - 1; i += 1) out[i].closed = true;
  return out;
}
