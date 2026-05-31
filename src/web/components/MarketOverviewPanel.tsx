import { useState, useEffect, useCallback } from "react";
import { Drawer } from "./Drawer.js";
import {
  MarketTreemap,
  type StockSnapshot,
  type MarketBreadth,
} from "./MarketTreemap.js";
import { MarketLiquidity, type LiquidityPoint } from "./MarketLiquidity.js";
import { MarketForeign, type ForeignFlowRow } from "./MarketForeign.js";

type Tab = "breadth" | "liquidity" | "foreign";

const TAB_LABELS: Record<Tab, string> = {
  breadth: "Biến động",
  liquidity: "Thanh khoản",
  foreign: "Khối ngoại",
};

interface BreadthResponse {
  stocks: StockSnapshot[];
  breadth: MarketBreadth;
  updatedAt: number;
}

interface LiquidityResponse {
  today: LiquidityPoint[];
  yesterday: LiquidityPoint[];
  updatedAt: number;
}

interface ForeignResponse {
  flows: ForeignFlowRow[];
  updatedAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const POLL_MS = 30_000;

export function MarketOverviewPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("breadth");
  const [breadth, setBreadth] = useState<BreadthResponse | null>(null);
  const [liquidity, setLiquidity] = useState<LiquidityResponse | null>(null);
  const [foreign, setForeign] = useState<ForeignResponse | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const fetchBreadth = useCallback(async () => {
    try {
      const res = await fetch("/api/market/breadth");
      if (!res.ok) return;
      const data: BreadthResponse = await res.json();
      setBreadth(data);
      setUpdatedAt(data.updatedAt);
    } catch {
      /* keep stale */
    }
  }, []);

  const fetchLiquidity = useCallback(async () => {
    try {
      const res = await fetch("/api/market/liquidity");
      if (!res.ok) return;
      const data: LiquidityResponse = await res.json();
      setLiquidity(data);
    } catch {
      /* keep stale */
    }
  }, []);

  const fetchForeign = useCallback(async () => {
    try {
      const res = await fetch("/api/market/foreign");
      if (!res.ok) return;
      const data: ForeignResponse = await res.json();
      setForeign(data);
    } catch {
      /* keep stale */
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    // Fetch both on open regardless of tab (breadth is fast, liquidity is for when user switches)
    fetchBreadth();
    fetchLiquidity();
    if (tab === "foreign") fetchForeign();

    const id = setInterval(() => {
      if (tab === "breadth") fetchBreadth();
      if (tab === "liquidity") fetchLiquidity();
      if (tab === "foreign") fetchForeign();
    }, POLL_MS);

    return () => clearInterval(id);
  }, [open, tab, fetchBreadth, fetchLiquidity, fetchForeign]);

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Thị trường"
      hint="Biến động theo ngành · Thanh khoản · Khối ngoại"
      width={680}
      extraHeaderContent={
        updatedLabel ? (
          <span
            style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}
          >
            {updatedLabel}
          </span>
        ) : undefined
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 160px)",
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid #2a2a2a",
            padding: "0 12px",
          }}
        >
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom:
                  tab === t ? "2px solid #26a69a" : "2px solid transparent",
                color: tab === t ? "#ddd" : "#555",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: tab === t ? 600 : 400,
                padding: "8px 12px",
                transition: "color 0.15s",
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {tab === "breadth" && (
            <MarketTreemap
              stocks={breadth?.stocks ?? null}
              breadth={breadth?.breadth ?? null}
            />
          )}
          {tab === "liquidity" && (
            <MarketLiquidity
              today={liquidity?.today ?? null}
              yesterday={liquidity?.yesterday ?? null}
            />
          )}
          {tab === "foreign" && (
            <MarketForeign
              flows={foreign?.flows ?? null}
              unavailable={!foreign}
            />
          )}
        </div>
      </div>
    </Drawer>
  );
}
