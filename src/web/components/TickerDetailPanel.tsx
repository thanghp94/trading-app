import { useState, useEffect } from "react";
import { Drawer } from "./Drawer.js";
import { TickerOrderBook } from "./TickerOrderBook.js";
import { TickerVolumePerMin } from "./TickerVolumePerMin.js";
import { TickerCumVolume } from "./TickerCumVolume.js";
import { TickerVolumeProfile } from "./TickerVolumeProfile.js";
import { TickerFundamentals } from "./TickerFundamentals.js";
import { TickerOwnership } from "./TickerOwnership.js";
import { TickerCorpActions } from "./TickerCorpActions.js";

type Tab = "intraday" | "valuation" | "ownership" | "events";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "intraday", label: "Phiên" },
  { id: "valuation", label: "Cơ bản" },
  { id: "ownership", label: "Sở hữu" },
  { id: "events", label: "Sự kiện" },
];

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
  const [tab, setTab] = useState<Tab>("intraday");

  // Reset to the intraday view whenever the symbol changes / panel reopens.
  useEffect(() => {
    setTab("intraday");
  }, [symbol]);

  useEffect(() => {
    if (!open || !symbol || tab !== "intraday") return;
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
  }, [open, symbol, tab]);

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
      {/* Tab bar — fundamentals only fetch when its tab is opened. */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid #2a2a2a",
          marginBottom: 8,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none",
              border: "none",
              borderBottom:
                tab === t.id ? "2px solid #4a9eff" : "2px solid transparent",
              color: tab === t.id ? "#e8e8e8" : "#888",
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: tab === t.id ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "valuation" && symbol ? (
        <TickerFundamentals symbol={symbol} />
      ) : tab === "ownership" && symbol ? (
        <TickerOwnership symbol={symbol} />
      ) : tab === "events" && symbol ? (
        <TickerCorpActions symbol={symbol} />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 200px)",
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
      )}
    </Drawer>
  );
}
