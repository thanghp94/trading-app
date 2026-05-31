import { useState, useEffect } from "react";
import { Drawer } from "./Drawer.js";
import { TickerOrderBook } from "./TickerOrderBook.js";
import { TickerVolumePerMin } from "./TickerVolumePerMin.js";
import { TickerCumVolume } from "./TickerCumVolume.js";
import { TickerVolumeProfile } from "./TickerVolumeProfile.js";

export interface IntradayCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  symbol: string | null;
  open: boolean;
  onClose: () => void;
}

function fmtPrice(p: number) {
  return (p / 1000).toFixed(2);
}

export function TickerDetailPanel({ symbol, open, onClose }: Props) {
  const [candles, setCandles] = useState<IntradayCandle[] | null>(null);

  useEffect(() => {
    if (!open || !symbol) return;
    setCandles(null); // reset on symbol change

    const load = async () => {
      try {
        const res = await fetch(
          `/api/ticker/${encodeURIComponent(symbol)}/intraday`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { candles: IntradayCandle[] };
        setCandles(data.candles ?? []);
      } catch {
        /* keep null */
      }
    };

    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [open, symbol]);

  const lastCandle = candles?.at(-1);
  const firstClose = candles?.[0]?.open ?? 0;
  const lastClose = lastCandle?.close ?? 0;
  const pctChange =
    firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : null;
  const pctLabel =
    pctChange != null
      ? `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`
      : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={symbol ?? "Ticker"}
      hint={
        [lastClose > 0 ? fmtPrice(lastClose) : null, pctLabel]
          .filter(Boolean)
          .join(" · ") || "Chi tiết phiên giao dịch"
      }
      width={720}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 160px)",
          gap: 0,
        }}
      >
        {/* Top: order book + volume profile side by side */}
        <div
          style={{
            display: "flex",
            minHeight: 180,
            borderBottom: "1px solid #2a2a2a",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              borderRight: "1px solid #2a2a2a",
              overflow: "hidden",
            }}
          >
            <TickerOrderBook depth={null} symbol={symbol ?? undefined} />
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TickerVolumeProfile candles={candles} />
          </div>
        </div>

        {/* KL/phút bar chart */}
        <div
          style={{
            height: 160,
            borderBottom: "1px solid #2a2a2a",
            flexShrink: 0,
          }}
        >
          <TickerVolumePerMin candles={candles} />
        </div>

        {/* Cumulative volume */}
        <div style={{ flex: 1, minHeight: 120 }}>
          <TickerCumVolume candles={candles} />
        </div>
      </div>
    </Drawer>
  );
}
