import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { Zone } from '../../shared/types.js';

/**
 * Draws S/R zones as filled, semi-transparent rectangles on the candle pane.
 *
 * Color palette:
 *   - active   support    → green
 *   - active   resistance → red
 *   - broken (any type)   → gray (faded)
 *   - flipped indicator   → dashed top/bottom edge (visual cue that role reversal occurred)
 *
 * Rectangle x-extent: from `formedAt` to the right edge of the chart (zones
 * project forward indefinitely until invalidated). Broken zones stop
 * extending at `brokenAt`.
 */

const COLORS = {
  supportFill: 'rgba(38, 166, 154, 0.18)',
  supportEdge: 'rgba(38, 166, 154, 0.85)',
  resistanceFill: 'rgba(239, 83, 80, 0.18)',
  resistanceEdge: 'rgba(239, 83, 80, 0.85)',
  brokenFill: 'rgba(110, 118, 129, 0.10)',
  brokenEdge: 'rgba(110, 118, 129, 0.55)',
} as const;

class ZoneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private zones: Zone[],
    private chart: IChartApi,
    private series: ISeriesApi<'Candlestick'>,
  ) {}

  draw(target: {
    useBitmapCoordinateSpace: (cb: (scope: {
      context: CanvasRenderingContext2D;
      bitmapSize: { width: number; height: number };
      horizontalPixelRatio: number;
      verticalPixelRatio: number;
    }) => void) => void;
  }) {
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hp, verticalPixelRatio: vp }) => {
      const timeScale = this.chart.timeScale();
      const chartWidth = bitmapSize.width;

      for (const z of this.zones) {
        const yTop = this.series.priceToCoordinate(z.top);
        const yBottom = this.series.priceToCoordinate(z.bottom);
        if (yTop == null || yBottom == null) continue;

        const xStart = timeScale.timeToCoordinate(z.formedAt as Time);
        const xEndTime = z.state === 'broken' && z.brokenAt ? z.brokenAt : null;
        const xEnd = xEndTime != null ? timeScale.timeToCoordinate(xEndTime as Time) : null;

        const px = (v: number | null) => (v == null ? null : v * hp);
        const py = (v: number) => v * vp;

        const x0 = px(xStart) ?? 0;
        const x1 = px(xEnd) ?? chartWidth;
        const y0 = Math.min(py(yTop), py(yBottom));
        const y1 = Math.max(py(yTop), py(yBottom));
        const w = Math.max(1, x1 - x0);
        const h = Math.max(1, y1 - y0);

        const isBroken = z.state === 'broken';
        const fill =
          isBroken
            ? COLORS.brokenFill
            : z.type === 'support'
              ? COLORS.supportFill
              : COLORS.resistanceFill;
        const edge =
          isBroken
            ? COLORS.brokenEdge
            : z.type === 'support'
              ? COLORS.supportEdge
              : COLORS.resistanceEdge;

        ctx.fillStyle = fill;
        ctx.fillRect(x0, y0, w, h);

        ctx.strokeStyle = edge;
        ctx.lineWidth = Math.max(1, vp);
        if (z.flipped) {
          // Dashed edge to mark role-reversal zones — same color as the new type.
          ctx.setLineDash([6 * hp, 4 * hp]);
        } else {
          ctx.setLineDash([]);
        }
        // Draw top + bottom edges only — keeps the zone visually as a "channel"
        // without overlapping vertical strokes that look noisy on busy charts.
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + w, y0);
        ctx.moveTo(x0, y1);
        ctx.lineTo(x0 + w, y1);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
  }
}

class ZonePaneView implements IPrimitivePaneView {
  constructor(
    private zones: Zone[],
    private chart: IChartApi,
    private series: ISeriesApi<'Candlestick'>,
  ) {}
  zOrder(): 'normal' | 'top' | 'bottom' {
    return 'normal';
  }
  renderer(): IPrimitivePaneRenderer {
    return new ZoneRenderer(this.zones, this.chart, this.series);
  }
}

export class ZonePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private zones: Zone[] = [];
  private view: ZonePaneView | null = null;

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time, 'Candlestick'>): void {
    this.chart = chart;
    this.series = series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = requestUpdate;
    this.view = new ZonePaneView(this.zones, this.chart, this.series);
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
    this.view = null;
  }

  paneViews(): IPrimitivePaneView[] {
    return this.view ? [this.view] : [];
  }

  updateAllViews(): void {
    if (this.view && this.chart && this.series) {
      this.view = new ZonePaneView(this.zones, this.chart, this.series);
    }
  }

  setZones(zones: Zone[]): void {
    this.zones = zones;
    if (this.chart && this.series) {
      this.view = new ZonePaneView(this.zones, this.chart, this.series);
    }
    this.requestUpdate?.();
  }
}
