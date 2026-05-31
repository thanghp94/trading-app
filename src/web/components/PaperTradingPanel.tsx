import { Drawer } from "./Drawer.js";
import type { TradeRow } from "../use-journal.js";

type UpdateFn = (
  id: string,
  patch: Partial<
    Pick<TradeRow, "sl" | "tp" | "exit_price" | "outcome" | "notes">
  >,
) => Promise<void>;

interface PaperTradingPanelProps {
  open: boolean;
  onClose: () => void;
  trades: TradeRow[];
  refresh: () => void;
  update: UpdateFn;
}

export function PaperTradingPanel({
  open,
  onClose,
  trades,
  refresh,
  update,
}: PaperTradingPanelProps) {
  // Derive virtual balance based on R-multiple, assuming $100 risk per 1R for simplicity
  const startingBalance = 10000;
  const RISK_PER_R = 100;

  const totalR = trades.reduce((acc, t) => acc + (t.r_multiple ?? 0), 0);
  const currentBalance = startingBalance + totalR * RISK_PER_R;

  const openTrades = trades.filter((t) => t.outcome === "open");

  // Cancel a paper trade — sets outcome=cancelled so it drops out of the
  // open filter and its ENTRY/SL/TP price lines disappear from the chart.
  const cancelOne = (id: string) => update(id, { outcome: "cancelled" });
  const cancelAll = async () => {
    if (!window.confirm(`Cancel all ${openTrades.length} open positions?`))
      return;
    for (const t of openTrades) await update(t.id, { outcome: "cancelled" });
  };

  const onMarketBuy = async () => {
    const sym = window.prompt("Symbol to Buy?", "BTCUSDT");
    if (!sym) return;
    await fetch("/api/journal/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym.toUpperCase(), direction: "bull" }),
    });
    refresh();
  };

  const onMarketSell = async () => {
    const sym = window.prompt("Symbol to Sell?", "BTCUSDT");
    if (!sym) return;
    await fetch("/api/journal/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym.toUpperCase(), direction: "bear" }),
    });
    refresh();
  };

  return (
    <Drawer
      open={open}
      title="💼 Paper Trading"
      hint="Practice with virtual money — market orders & open positions, no real risk."
      onClose={onClose}
      width={300}
    >
      <div style={contentStyle}>
        <div style={balanceStyle}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Virtual Equity
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: "bold",
              color: totalR >= 0 ? "var(--bull)" : "var(--bear)",
            }}
          >
            $
            {currentBalance.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Starting: $10,000.00
          </div>
        </div>

        <div style={actionsStyle}>
          <button
            className="btn-primary"
            style={{ background: "var(--bull)" }}
            onClick={onMarketBuy}
          >
            Market Buy
          </button>
          <button
            className="btn-primary"
            style={{ background: "var(--bear)" }}
            onClick={onMarketSell}
          >
            Market Sell
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: "bold" }}>
              Open Positions ({openTrades.length})
            </span>
            {openTrades.length > 0 && (
              <button
                type="button"
                onClick={cancelAll}
                style={cancelAllStyle}
                title="Cancel all open positions"
              >
                Cancel all
              </button>
            )}
          </div>
          {openTrades.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              No active positions.
            </div>
          ) : (
            <div style={{ maxHeight: 150, overflowY: "auto" }}>
              {openTrades.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11,
                    padding: "4px 0",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  <span>
                    {t.direction === "bull" ? "🟢" : "🔴"} {t.symbol}
                  </span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span>Entry: {t.entry_price}</span>
                    <button
                      type="button"
                      onClick={() => cancelOne(t.id)}
                      style={cancelBtnStyle}
                      title="Cancel this position"
                    >
                      ×
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

const contentStyle: React.CSSProperties = {
  padding: 12,
};

const balanceStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: 12,
  paddingBottom: 12,
  borderBottom: "1px solid var(--border-color)",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "center",
};

const cancelAllStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 6px",
  background: "transparent",
  border: "1px solid var(--bear)",
  borderRadius: 3,
  color: "var(--bear)",
  cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1,
  width: 16,
  height: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  color: "var(--bear)",
  cursor: "pointer",
};
