import { useState } from "react";
import { fmtPrice } from "../../shared/fmt-price.js";
import type { Alert } from "../../shared/types.js";
import { savePrefs } from "../use-alert-notifications.js";
import { Drawer } from "./Drawer.js";

interface AlertPanelProps {
  alerts: Alert[];
  onClear: () => void;
  open: boolean;
  onClose: () => void;
}

interface NotifyPrefs {
  sound: boolean;
  titleBadge: boolean;
  voice: boolean;
}

function loadPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem("trading-app:notify-prefs-v1");
    if (raw)
      return {
        sound: true,
        titleBadge: true,
        voice: false,
        ...(JSON.parse(raw) as Partial<NotifyPrefs>),
      };
  } catch {
    /* ignore */
  }
  return { sound: true, titleBadge: true, voice: false };
}

export function AlertPanel({
  alerts,
  onClear,
  open,
  onClose,
}: AlertPanelProps) {
  const [prefs, setPrefsState] = useState<NotifyPrefs>(loadPrefs());
  const recent = alerts.slice(-20).reverse();

  const togglePref = (key: keyof NotifyPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefsState(next);
    savePrefs(next);
  };

  return (
    <Drawer
      open={open}
      title="🔔 Alerts"
      hint="Live signal feed — toggle sound/voice/tab-badge, take an alert to the journal."
      onClose={onClose}
      width={360}
    >
      <div style={listStyle}>
        <div style={prefRowStyle}>
          <PrefToggle
            label="🔊 Sound"
            active={prefs.sound}
            onClick={() => togglePref("sound")}
          />
          <PrefToggle
            label="📛 Tab badge"
            active={prefs.titleBadge}
            onClick={() => togglePref("titleBadge")}
          />
          <PrefToggle
            label="🗣 Voice"
            active={prefs.voice}
            onClick={() => togglePref("voice")}
          />
        </div>
        {recent.length === 0 ? (
          <div style={emptyStyle}>
            No alerts yet. Configure ALERT_SYMBOLS in .env or open a chart and
            wait for a wave to fire.
          </div>
        ) : (
          recent.map((a) => <AlertRow key={a.id} alert={a} />)
        )}
        {recent.length > 0 && (
          <button type="button" onClick={onClear} style={clearBtnStyle}>
            Clear local history
          </button>
        )}
      </div>
    </Drawer>
  );
}

function PrefToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...prefBtnStyle,
        ...(active
          ? { background: "#1f6feb", color: "#fff", borderColor: "#1f6feb" }
          : {}),
      }}
    >
      {label}
    </button>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const t = new Date(alert.time * 1000).toISOString().slice(11, 16);
  const arrow = alert.direction === "bull" ? "🟢" : "🔴";

  const takeTrade = async () => {
    // Find the auto-logged trade for this alert and open it in the journal.
    // KISS: open the journal panel by scrolling to the section.
    try {
      const res = await fetch("/api/journal");
      const json = (await res.json()) as {
        trades: Array<{ id: string; alert_id: string | null }>;
      };
      const t = json.trades.find((x) => x.alert_id === alert.id);
      if (t) {
        // No deep-link to the inline editor; the journal panel auto-refreshes.
        // Future: dispatch a custom event the JournalPanel listens for.
        window.dispatchEvent(
          new CustomEvent("trading-app:edit-trade", { detail: { id: t.id } }),
        );
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <span style={{ marginRight: 6 }}>{arrow}</span>
        <span style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "#c9d1d9" }}>{alert.headline}</div>
          <div style={{ fontSize: 10, color: "#8b949e" }}>
            {t} · {alert.rule} · {fmtPrice(alert.price, alert.symbol)}
          </div>
          {alert.aiSummary && (
            <div style={aiSummaryStyle}>🧠 {alert.aiSummary}</div>
          )}
        </span>
        <button
          type="button"
          onClick={takeTrade}
          style={takeBtnStyle}
          title="Open this trade in the journal panel for SL/TP entry"
        >
          📓 Take
        </button>
      </div>
    </div>
  );
}

const listStyle: React.CSSProperties = {
  padding: 8,
};
const prefRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "0 0 6px",
  marginBottom: 6,
  borderBottom: "1px solid var(--border-color)",
};
const prefBtnStyle: React.CSSProperties = {
  padding: "3px 6px",
  fontSize: 10,
  fontFamily: "inherit",
  border: "1px solid var(--border-solid)",
  borderRadius: 3,
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  flex: 1,
};
const rowStyle: React.CSSProperties = {
  padding: "6px 4px",
  borderBottom: "1px solid #161b22",
};
const aiSummaryStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#c9d1d9",
  background: "#161b22",
  padding: "4px 6px",
  borderRadius: 3,
  lineHeight: 1.4,
};
const takeBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#8b949e",
  border: "1px solid #30363d",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 10,
  padding: "2px 6px",
  whiteSpace: "nowrap",
};
const emptyStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#8b949e",
  padding: 12,
  lineHeight: 1.5,
};
const clearBtnStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "4px 8px",
  fontSize: 11,
  fontFamily: "inherit",
  background: "transparent",
  border: "1px solid #30363d",
  borderRadius: 3,
  color: "#8b949e",
  cursor: "pointer",
  width: "100%",
};
