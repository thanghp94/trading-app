import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { DepthSnapshot } from "../../shared/types.js";

class HeatmapRenderer implements IPrimitivePaneRenderer {
  constructor(
    private depth: DepthSnapshot | null,
    _chart: IChartApi,
    private series: ISeriesApi<"Candlestick">,
  ) {}

  draw(target: {
    useBitmapCoordinateSpace: (
      cb: (scope: {
        context: CanvasRenderingContext2D;
        bitmapSize: { width: number; height: number };
        horizontalPixelRatio: number;
        verticalPixelRatio: number;
      }) => void,
    ) => void;
  }) {
    if (!this.depth) return;

    target.useBitmapCoordinateSpace(
      ({
        context: ctx,
        bitmapSize,
        horizontalPixelRatio: _hp,
        verticalPixelRatio: vp,
      }) => {
        const chartWidth = bitmapSize.width;

        const bids = this.depth!.bids;
        const asks = this.depth!.asks;
        if (bids.length === 0 && asks.length === 0) return;

        const maxQty = Math.max(
          ...bids.map((b) => b[1]),
          ...asks.map((a) => a[1]),
        );

        if (maxQty === 0) return;

        // Draw Asks (Red)
        ctx.fillStyle = "rgba(239, 83, 80, 0.4)"; // Semi-transparent red
        for (const [price, qty] of asks) {
          const y = this.series.priceToCoordinate(price);
          if (y === null) continue;

          const barWidth = (qty / maxQty) * (chartWidth * 0.4); // Max 40% of chart width
          const barHeight = Math.max(1, 2 * vp); // 2px height

          ctx.fillRect(
            chartWidth - barWidth,
            y * vp - barHeight / 2,
            barWidth,
            barHeight,
          );
        }

        // Draw Bids (Green)
        ctx.fillStyle = "rgba(38, 166, 154, 0.4)"; // Semi-transparent green
        for (const [price, qty] of bids) {
          const y = this.series.priceToCoordinate(price);
          if (y === null) continue;

          const barWidth = (qty / maxQty) * (chartWidth * 0.4);
          const barHeight = Math.max(1, 2 * vp);

          ctx.fillRect(
            chartWidth - barWidth,
            y * vp - barHeight / 2,
            barWidth,
            barHeight,
          );
        }
      },
    );
  }
}

class HeatmapPaneView implements IPrimitivePaneView {
  constructor(
    private depth: DepthSnapshot | null,
    private chart: IChartApi,
    private series: ISeriesApi<"Candlestick">,
  ) {}

  zOrder(): "normal" | "top" | "bottom" {
    return "bottom"; // Draw behind candles
  }

  renderer(): IPrimitivePaneRenderer {
    return new HeatmapRenderer(this.depth, this.chart, this.series);
  }
}

export class HeatmapPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private requestUpdate: (() => void) | null = null;
  private depth: DepthSnapshot | null = null;
  private view: HeatmapPaneView | null = null;

  attached({
    chart,
    series,
    requestUpdate,
  }: SeriesAttachedParameter<Time, "Candlestick">): void {
    this.chart = chart;
    this.series = series as ISeriesApi<"Candlestick">;
    this.requestUpdate = requestUpdate;
    this.view = new HeatmapPaneView(this.depth, this.chart, this.series);
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
      this.view = new HeatmapPaneView(this.depth, this.chart, this.series);
    }
  }

  setDepth(depth: DepthSnapshot | null): void {
    this.depth = depth;
    if (this.chart && this.series) {
      this.view = new HeatmapPaneView(this.depth, this.chart, this.series);
    }
    this.requestUpdate?.();
  }
}
