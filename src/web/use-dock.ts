import { useCallback, useState } from "react";

/** Panels reachable from the bottom dock. One open at a time. */
export type PanelId =
  | "paper"
  | "strategy"
  | "backtest"
  | "journal"
  | "alerts"
  | "watchlist"
  | "chat";

/**
 * Single-open dock state. Replaces each panel's private open/expanded flag so
 * opening one drawer closes the previous — the core of the declutter.
 */
export function useDock() {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const open = useCallback((id: PanelId) => setActivePanel(id), []);
  const close = useCallback(() => setActivePanel(null), []);
  const toggle = useCallback(
    (id: PanelId) => setActivePanel((cur) => (cur === id ? null : id)),
    [],
  );
  return { activePanel, open, close, toggle };
}
