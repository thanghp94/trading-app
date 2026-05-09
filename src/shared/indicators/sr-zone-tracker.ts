import type { Candle, Zone } from '../types.js';
import { atr } from './atr.js';
import { detectPivots, type Pivot } from './pivot-detector.js';

interface ComputeOpts {
  /** Fractal width (default 2 → 5-bar fractal). */
  pivotN?: number;
  /** ATR window for clustering tolerance (default 14). */
  atrPeriod?: number;
  /** Cluster pivots whose midpoints are within `clusterAtrMult × ATR` (default 0.3). */
  clusterAtrMult?: number;
  /** Drop zones older than `maxBarsRetained` bars from the *latest* candle (default 1000 — matches the backfill window so all visible-history zones stay rendered). */
  maxBarsRetained?: number;
}

/**
 * Compute S/R zones from the visible candle history. Pure function —
 * recomputes from scratch on each call. For a personal-tool MVP at ~100-500
 * bars per chart, this is fine. When alerts move server-side (W3) we'll
 * port the same logic into a stateful streaming version.
 *
 * Pivot anchoring (per user request, "rau nen" = candle wick):
 *   - Swing-high zone: top = wick high, bottom = max(open, close)
 *   - Swing-low zone:  top = min(open, close), bottom = wick low
 * The zone rectangle is the wick-to-body "rejection box."
 *
 * State machine (active → broken → flipped):
 *   - active:  zone formed, price has not closed beyond it in the break direction.
 *   - broken:  a bar closed beyond the zone (close < bottom for support,
 *              close > top for resistance). Color fades to gray.
 *   - flipped: after broken, price revisited from the new side and closed back
 *              without breaking through. The zone's TYPE flips (support↔resistance)
 *              and state returns to active — role reversal.
 */
export function computeZones(candles: Candle[], opts: ComputeOpts = {}): Zone[] {
  const { pivotN = 2, atrPeriod = 14, clusterAtrMult = 0.3, maxBarsRetained = 1000 } = opts;
  if (candles.length < atrPeriod + 2 * pivotN + 1) return [];

  const atrSeries = atr(candles, atrPeriod);
  const pivots = detectPivots(candles, pivotN);
  if (pivots.length === 0) return [];

  // Cluster pivots by proximity. Group when the midpoints are within
  // `clusterAtrMult × ATR` (using ATR at the most recent pivot's bar).
  const clusters = clusterPivots(pivots, atrSeries, clusterAtrMult);

  // Build a zone per cluster. Type = the kind of the most recent pivot in the cluster.
  const zones: Zone[] = clusters.map((cluster, idx) => {
    const lastPivot = cluster[cluster.length - 1];
    const allTops = cluster.map((p) => (p.kind === 'high' ? p.wick : p.body));
    const allBottoms = cluster.map((p) => (p.kind === 'low' ? p.wick : p.body));
    return {
      id: `z${idx}_${lastPivot.time}`,
      type: lastPivot.kind === 'high' ? 'resistance' : 'support',
      state: 'active',
      top: Math.max(...allTops),
      bottom: Math.min(...allBottoms),
      formedAt: cluster[0].time,
      flipped: false,
    };
  });

  // Walk every candle that comes after each zone formed and update state.
  for (const zone of zones) {
    const startIdx = candles.findIndex((c) => c.time > zone.formedAt);
    if (startIdx < 0) continue;
    let lastTouchedIdx = -1;

    for (let i = startIdx; i < candles.length; i += 1) {
      const c = candles[i];

      if (zone.state === 'active') {
        // Touch (wick into zone): no state change, just remember.
        if (c.high >= zone.bottom && c.low <= zone.top) lastTouchedIdx = i;

        // Break (close beyond zone in the break direction).
        if (zone.type === 'support' && c.close < zone.bottom) {
          zone.state = 'broken';
          zone.brokenAt = c.time;
        } else if (zone.type === 'resistance' && c.close > zone.top) {
          zone.state = 'broken';
          zone.brokenAt = c.time;
        }
      } else if (zone.state === 'broken' && !zone.flipped) {
        // Watch for revisit-from-new-side: a touch into the zone followed by a
        // close back on the new (post-break) side → role reversal.
        const wickInZone = c.high >= zone.bottom && c.low <= zone.top;
        if (zone.type === 'support' && wickInZone && c.close > zone.top) {
          // Was support, broken downward, now revisited from below and rejected → flip to resistance.
          zone.type = 'resistance';
          zone.state = 'active';
          zone.flipped = true;
        } else if (zone.type === 'resistance' && wickInZone && c.close < zone.bottom) {
          // Was resistance, broken upward, now revisited from above and rejected → flip to support.
          zone.type = 'support';
          zone.state = 'active';
          zone.flipped = true;
        }
      }
      // Once a flipped zone goes active again, the same active-state logic
      // applies on the next candle (handled naturally by the loop).
    }
    void lastTouchedIdx; // reserved for a future "tested" sub-state
  }

  // Eviction — drop zones whose latest activity is older than `maxBarsRetained`
  // bars from the most recent candle. Keeps the chart from accumulating stale
  // zones over months of operation.
  const latest = candles[candles.length - 1];
  const minTime = latest.time - barsToSeconds(candles, maxBarsRetained);
  return zones.filter((z) => Math.max(z.formedAt, z.brokenAt ?? 0) >= minTime);
}

function clusterPivots(pivots: Pivot[], atrSeries: number[], clusterAtrMult: number): Pivot[][] {
  // Sort by midpoint price; merge consecutive pivots whose midpoints are
  // within `clusterAtrMult × ATR(at the more recent pivot)`.
  const withMid = pivots.map((p) => ({ p, mid: (p.wick + p.body) / 2 }));
  withMid.sort((a, b) => a.mid - b.mid);

  const clusters: Pivot[][] = [];
  for (const { p, mid } of withMid) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push([p]);
      continue;
    }
    const lastP = last[last.length - 1];
    const lastMid = (lastP.wick + lastP.body) / 2;
    const refAtr = atrSeries[Math.max(p.index, lastP.index)];
    const tol = (Number.isFinite(refAtr) ? refAtr : Math.abs(lastMid) * 0.005) * clusterAtrMult;
    if (Math.abs(mid - lastMid) <= tol) {
      last.push(p);
    } else {
      clusters.push([p]);
    }
  }
  return clusters;
}

function barsToSeconds(candles: Candle[], bars: number): number {
  if (candles.length < 2) return Number.POSITIVE_INFINITY;
  const stride = candles[candles.length - 1].time - candles[candles.length - 2].time;
  return bars * Math.max(stride, 60);
}
