import type { PanelId } from "../use-dock.js";

interface DockButtonDef {
  id: PanelId;
  icon: string;
  label: string;
  tier: "core" | "advanced";
}

const BUTTONS: DockButtonDef[] = [
  { id: "paper", icon: "💼", label: "Paper", tier: "core" },
  { id: "journal", icon: "📓", label: "Journal", tier: "core" },
  { id: "alerts", icon: "🔔", label: "Alerts", tier: "core" },
  { id: "watchlist", icon: "🎯", label: "Watchlist", tier: "core" },
  { id: "chat", icon: "💬", label: "Chat", tier: "core" },
  { id: "market", icon: "🗺️", label: "Market", tier: "core" },
  { id: "screener", icon: "📡", label: "Screener", tier: "advanced" },
  { id: "strategy", icon: "⚙️", label: "Strategy", tier: "advanced" },
  { id: "backtest", icon: "📊", label: "Backtest", tier: "advanced" },
];

interface DockBarProps {
  active: PanelId | null;
  onSelect: (id: PanelId) => void;
  badges?: Partial<Record<PanelId, number>>;
}

/**
 * Single bottom dock — the only always-on chrome. Core (daily) buttons left,
 * advanced (occasional) right of a divider, so the eye isn't hit with everything
 * at once. Clicking toggles the matching drawer.
 */
export function DockBar({ active, onSelect, badges }: DockBarProps) {
  const core = BUTTONS.filter((b) => b.tier === "core");
  const advanced = BUTTONS.filter((b) => b.tier === "advanced");

  return (
    <div className="panel-glass" style={dockStyle}>
      {core.map((b) => (
        <DockButton
          key={b.id}
          def={b}
          active={active === b.id}
          badge={badges?.[b.id]}
          onClick={() => onSelect(b.id)}
        />
      ))}
      <div style={dividerStyle} />
      {advanced.map((b) => (
        <DockButton
          key={b.id}
          def={b}
          active={active === b.id}
          badge={badges?.[b.id]}
          onClick={() => onSelect(b.id)}
        />
      ))}
    </div>
  );
}

function DockButton({
  def,
  active,
  badge,
  onClick,
}: {
  def: DockButtonDef;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...btnStyle, ...(active ? activeBtnStyle : {}) }}
      title={def.label}
    >
      <span style={{ fontSize: 14 }}>{def.icon}</span>
      <span style={labelStyle}>{def.label}</span>
      {badge != null && badge > 0 && <span style={badgeStyle}>{badge}</span>}
    </button>
  );
}

const dockStyle: React.CSSProperties = {
  position: "fixed",
  left: 12,
  right: 12,
  bottom: 8,
  height: 40,
  zIndex: 130,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 10px",
};
const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: "var(--border-solid)",
  margin: "0 4px",
};
const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid transparent",
  borderRadius: 6,
  cursor: "pointer",
  transition: "all 0.15s ease",
};
const activeBtnStyle: React.CSSProperties = {
  background: "var(--bg-panel-solid)",
  color: "var(--text-main)",
  borderColor: "var(--accent)",
};
const labelStyle: React.CSSProperties = {
  whiteSpace: "nowrap",
};
const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#000",
  background: "var(--accent)",
  borderRadius: 8,
  padding: "0 6px",
  lineHeight: "16px",
  minWidth: 16,
  textAlign: "center",
};
