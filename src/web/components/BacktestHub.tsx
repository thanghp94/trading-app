import { useState } from "react";
import { Drawer } from "./Drawer.js";
import { VnBacktestPanel } from "./VnBacktestPanel.js";
import { BacktestRunsPanel } from "./BacktestRunsPanel.js";
import { BacktestSweepPanel } from "./BacktestSweepPanel.js";
import { BacktestPortfolioPanel } from "./BacktestPortfolioPanel.js";
import { SignalStudyPanel } from "./SignalStudyPanel.js";

type TabId = "run" | "saved" | "sweep" | "portfolio" | "signals";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "run", label: "Run" },
  { id: "saved", label: "Saved" },
  { id: "sweep", label: "Sweep" },
  { id: "portfolio", label: "Portfolio" },
  { id: "signals", label: "Signals" },
];

interface BacktestHubProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Single backtest entry point. Collapses the four former bottom-left launchers
 * (VN Backtest, Saved Runs, Param Sweep, Portfolio) into one tabbed drawer.
 * Only the active tab mounts, so the heavy VN form loads lazily.
 */
export function BacktestHub({ open, onClose }: BacktestHubProps) {
  const [tab, setTab] = useState<TabId>("run");

  return (
    <Drawer
      open={open}
      title="📊 Backtest"
      hint="Run strategies on history, save & compare runs, sweep params, test a portfolio."
      onClose={onClose}
      width={780}
    >
      <div style={tabBarStyle}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{ ...tabBtnStyle, ...(tab === t.id ? activeTabStyle : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={bodyStyle}>
        {tab === "run" && <VnBacktestPanel embedded />}
        {tab === "saved" && <BacktestRunsPanel embedded />}
        {tab === "sweep" && <BacktestSweepPanel embedded />}
        {tab === "portfolio" && <BacktestPortfolioPanel embedded />}
        {tab === "signals" && <SignalStudyPanel embedded />}
      </div>
    </Drawer>
  );
}

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  padding: "8px 12px",
  borderBottom: "1px solid var(--border-color)",
};
const tabBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  fontFamily: "inherit",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border-solid)",
  borderRadius: 6,
  cursor: "pointer",
};
const activeTabStyle: React.CSSProperties = {
  color: "var(--text-main)",
  borderColor: "var(--accent)",
  background: "var(--bg-panel-solid)",
};
const bodyStyle: React.CSSProperties = {
  padding: 8,
};
