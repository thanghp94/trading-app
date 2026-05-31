import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "./Drawer.js";

interface ScannerEntry {
  symbol: string;
  timeframe: string;
  score: number;
  reasons: string[];
  lastClose: number;
  lastTime: number;
}

interface PinnedSymbol {
  symbol: string;
  timeframe: string;
  addedAt: number;
}

interface WatchlistPanelProps {
  onPick?: (symbol: string, timeframe: string) => void;
  open: boolean;
  onClose: () => void;
  onCount?: (n: number) => void;
}

const TF_OPTIONS = ["1d", "1h", "15m", "5m"];

/**
 * Watchlist panel with two sections:
 * - Pinned symbols (persistent, managed via /api/watchlist)
 * - Live scanner (auto-scored, polls every 30s)
 */
export function WatchlistPanel({
  onPick,
  open,
  onClose,
  onCount,
}: WatchlistPanelProps) {
  const [entries, setEntries] = useState<ScannerEntry[]>([]);
  const [pinned, setPinned] = useState<PinnedSymbol[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [tf, setTf] = useState("1d");
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── fetch live scanner ───────────────────────────────────────────
  const refreshScan = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/scan");
      setEntries((await res.json()) as ScannerEntry[]);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, []);

  // ── fetch pinned list ────────────────────────────────────────────
  const refreshPinned = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      setPinned((await res.json()) as PinnedSymbol[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshScan();
    void refreshPinned();
    const id = window.setInterval(refreshScan, 30_000);
    return () => window.clearInterval(id);
  }, [refreshScan, refreshPinned]);

  useEffect(() => {
    onCount?.(pinned.length + entries.length);
  }, [pinned, entries, onCount]);

  // ── add symbols ──────────────────────────────────────────────────
  const addSymbols = async () => {
    const raw = input.trim();
    if (!raw) return;
    setAdding(true);
    setAddError(null);
    setInput("");
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: raw, timeframe: tf }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setAddError(err.message ?? `Error ${res.status}`);
        return;
      }
      // Use the POST response (full updated list) directly — no second round-trip.
      setPinned((await res.json()) as PinnedSymbol[]);
    } catch (e) {
      setAddError(String(e));
    } finally {
      setAdding(false);
      inputRef.current?.focus();
    }
  };

  const removePin = async (symbol: string) => {
    await fetch(`/api/watchlist/${symbol}`, { method: "DELETE" });
    void refreshPinned();
  };

  const expandBtn = (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      style={expandBtnStyle}
      title={expanded ? "Collapse to drawer" : "Expand to full screen"}
    >
      {expanded ? "⊡" : "⛶"}
    </button>
  );

  const body = (
    <>
      {/* ── Add row ──────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={addRowStyle}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Pin symbols: HPG, VCB, FPT"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addSymbols();
            }}
            style={inputStyle}
          />
          <select
            value={tf}
            onChange={(e) => setTf(e.target.value)}
            style={tfStyle}
          >
            {TF_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void addSymbols()}
            disabled={adding}
            style={{ ...addBtnStyle, opacity: adding ? 0.6 : 1 }}
          >
            {adding ? "…" : "Pin"}
          </button>
        </div>
        {addError && <div style={errorStyle}>{addError}</div>}
      </div>

      {/* ── Scanner section ───────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionLabelStyle}>Live scanner · top setups</span>
          <button type="button" onClick={refreshScan} style={refreshBtnStyle}>
            {busy ? "↻" : "refresh"}
          </button>
        </div>
        {entries.length === 0 ? (
          <div style={emptyStyle}>
            No setups scored yet. Pinned symbols appear here within ~30s.
          </div>
        ) : (
          entries.map((e) => {
            const isPinned = pinned.some((p) => p.symbol === e.symbol);
            return (
              <div
                key={`${e.symbol}-${e.timeframe}`}
                style={rowStyle}
                onClick={() => onPick?.(e.symbol, e.timeframe)}
                title={onPick ? "Click to load in first chart" : undefined}
              >
                <div style={rowHeaderStyle}>
                  <span style={{ fontSize: 12, color: "#c9d1d9" }}>
                    <b>{e.symbol}</b> {e.timeframe} · {e.lastClose}
                    {isPinned && (
                      <span style={pinnedDotStyle} title="Pinned">
                        📌
                      </span>
                    )}
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span style={scoreStyle}>{e.score}</span>
                    {isPinned ? (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void removePin(e.symbol);
                        }}
                        style={unpinBtnStyle}
                        title="Unpin"
                      >
                        ×
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async (ev) => {
                          ev.stopPropagation();
                          setAdding(true);
                          try {
                            const res = await fetch("/api/watchlist", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                symbols: e.symbol,
                                timeframe: e.timeframe,
                              }),
                            });
                            if (res.ok)
                              setPinned((await res.json()) as PinnedSymbol[]);
                          } finally {
                            setAdding(false);
                          }
                        }}
                        style={pinRowBtnStyle}
                        title="Pin this symbol"
                      >
                        📌
                      </button>
                    )}
                  </div>
                </div>
                <ul style={reasonsStyle}>
                  {e.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  if (expanded) {
    return (
      <div style={fullPageStyle}>
        <div style={fullPageInnerStyle}>
          <div style={fullPageHeaderStyle}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>🎯 Watchlist</span>
            <div style={{ display: "flex", gap: 6 }}>
              {expandBtn}
              <button
                type="button"
                onClick={onClose}
                style={closeStyle}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
          <div style={fullPageBodyStyle}>{body}</div>
        </div>
      </div>
    );
  }

  return (
    <Drawer
      open={open}
      title="🎯 Watchlist"
      hint="Pin symbols to monitor permanently. Live scanner scores all monitored streams."
      onClose={onClose}
      width={380}
      extraHeaderContent={expandBtn}
    >
      {body}
    </Drawer>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border-color)",
};
const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 8,
};
const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};
const addRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  marginBottom: 8,
};
const inputStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 11,
  fontFamily: "inherit",
  background: "var(--bg-panel-solid)",
  color: "var(--text-main)",
  border: "1px solid var(--border-solid)",
  borderRadius: 4,
  padding: "5px 8px",
};
const tfStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "inherit",
  background: "var(--bg-panel-solid)",
  color: "var(--text-main)",
  border: "1px solid var(--border-solid)",
  borderRadius: 4,
  padding: "5px 4px",
};
const addBtnStyle: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 11,
  fontFamily: "inherit",
  background: "var(--accent)",
  color: "#000",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
};
const refreshBtnStyle: React.CSSProperties = {
  fontSize: 10,
  background: "transparent",
  border: "1px solid var(--border-solid)",
  borderRadius: 3,
  color: "var(--text-muted)",
  padding: "2px 6px",
  cursor: "pointer",
};
const rowStyle: React.CSSProperties = {
  padding: "6px 4px",
  borderBottom: "1px solid var(--border-color)",
  cursor: "pointer",
};
const rowHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
};
const scoreStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#26a69a",
};
const reasonsStyle: React.CSSProperties = {
  margin: "4px 0 0",
  padding: "0 0 0 16px",
  fontSize: 10,
  color: "#8b949e",
  listStyle: "disc",
};
const emptyStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  lineHeight: 1.5,
};
const errorStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--bear)",
  marginBottom: 6,
};
const pinnedDotStyle: React.CSSProperties = { marginLeft: 4, fontSize: 10 };
const unpinBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border-solid)",
  borderRadius: 3,
  color: "var(--text-muted)",
  fontSize: 12,
  padding: "1px 5px",
  cursor: "pointer",
  lineHeight: 1,
};
const pinRowBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 11,
  padding: "1px 3px",
  cursor: "pointer",
  opacity: 0.4,
};
const expandBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: 4,
};
const closeStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: 4,
};
const fullPageStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const fullPageInnerStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border-solid)",
  borderRadius: 8,
  width: "min(900px, 95vw)",
  height: "85vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
};
const fullPageHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border-color)",
  flexShrink: 0,
};
const fullPageBodyStyle: React.CSSProperties = {
  overflowY: "auto",
  flex: 1,
};
