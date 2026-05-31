import { useMemo } from "react";
import type { IntradayCandle } from "./TickerDetailPanel.js";

interface Props {
  candles: IntradayCandle[] | null;
  buckets?: number;
}

interface ProfileBucket {
  priceLo: number;
  priceHi: number;
  priceMid: number;
  volume: number;
}

function buildProfile(
  candles: IntradayCandle[],
  buckets: number,
): ProfileBucket[] {
  const prices = candles.flatMap((c) => [c.high, c.low]).filter((p) => p > 0);
  if (prices.length === 0) return [];
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  if (hi === lo) return [];

  const step = (hi - lo) / buckets;
  const vols = new Array(buckets).fill(0);

  for (const c of candles) {
    const mid = (c.high + c.low) / 2;
    const idx = Math.min(Math.floor((mid - lo) / step), buckets - 1);
    vols[idx] += c.volume;
  }

  return vols.map((volume, i) => ({
    priceLo: lo + i * step,
    priceHi: lo + (i + 1) * step,
    priceMid: lo + (i + 0.5) * step,
    volume,
  }));
}

function fmtPrice(p: number) {
  return (p / 1000).toFixed(1);
}

export function TickerVolumeProfile({ candles, buckets = 20 }: Props) {
  const profile = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    return buildProfile(candles, buckets);
  }, [candles, buckets]);

  if (!candles) {
    return (
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>
          KL khớp theo giá
        </div>
        <div
          className="animate-pulse"
          style={{ height: 160, background: "#1e1e1e", borderRadius: 4 }}
        />
      </div>
    );
  }

  if (!profile || profile.length === 0) {
    return (
      <div style={{ padding: 8, fontSize: 11, color: "#444" }}>
        <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>
          KL khớp theo giá
        </div>
        Chưa có dữ liệu phiên hôm nay
      </div>
    );
  }

  const maxVol = Math.max(...profile.map((b) => b.volume), 1);
  // POC = bucket with highest volume
  const pocIdx = profile.reduce(
    (best, b, i) => (b.volume > profile[best].volume ? i : best),
    0,
  );
  // Render high price at top → reverse order
  const reversed = [...profile].reverse();

  const LABEL_W = 44;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#666",
          padding: "4px 8px",
          flexShrink: 0,
        }}
      >
        KL khớp theo giá
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 4px" }}>
        {reversed.map((b, ri) => {
          const origIdx = profile.length - 1 - ri;
          const isPoc = origIdx === pocIdx;
          const pct = maxVol > 0 ? (b.volume / maxVol) * 100 : 0;

          return (
            <div
              key={ri}
              style={{
                display: "flex",
                alignItems: "center",
                height: 14,
                marginBottom: 1,
              }}
            >
              <span
                style={{
                  width: LABEL_W,
                  flexShrink: 0,
                  fontSize: 9,
                  color: isPoc ? "#ffa726" : "#555",
                  fontFamily: "monospace",
                  textAlign: "right",
                  paddingRight: 4,
                }}
              >
                {fmtPrice(b.priceMid)}
              </span>
              <div style={{ flex: 1, height: "100%", position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 1,
                    bottom: 1,
                    width: `${pct}%`,
                    background: isPoc ? "#ffa726" : "rgba(38,166,154,0.5)",
                    borderRadius: 1,
                    transition: "width 0.2s",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontSize: 9,
          color: "#444",
          padding: "2px 8px",
          flexShrink: 0,
        }}
      >
        POC: {fmtPrice(profile[pocIdx].priceMid)}
      </div>
    </div>
  );
}
