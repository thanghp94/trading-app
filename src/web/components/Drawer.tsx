import { useEffect } from "react";

interface DrawerProps {
  open: boolean;
  title: string;
  /** One-line description shown under the title so unfamiliar features explain themselves. */
  hint?: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
  /** Extra buttons rendered in the header row, left of the close button. */
  extraHeaderContent?: React.ReactNode;
}

/** Height the dock occupies; drawers anchor just above it. Keep in sync with DockBar. */
export const DOCK_OFFSET = 56;

/**
 * Shared drawer that slides up above the dock. One instance shows at a time
 * (parent gates via `open`). Esc or click-away closes. Charts stay visible —
 * the scrim is transparent, only catching the click-to-dismiss.
 */
export function Drawer({
  open,
  title,
  hint,
  onClose,
  width = 380,
  children,
  extraHeaderContent,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div style={scrimStyle} onClick={onClose} />
      <div
        className="panel-glass animate-fade-in"
        style={{ ...drawerStyle, width }}
      >
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={titleStyle}>{title}</div>
            {hint && <div style={hintStyle}>{hint}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {extraHeaderContent}
            <button
              type="button"
              onClick={onClose}
              style={closeStyle}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
        <div style={bodyStyle}>{children}</div>
      </div>
    </>
  );
}

const scrimStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 110,
  background: "transparent",
};
const drawerStyle: React.CSSProperties = {
  position: "fixed",
  left: 12,
  bottom: DOCK_OFFSET,
  zIndex: 120,
  maxWidth: "calc(100vw - 24px)",
  maxHeight: `calc(100vh - ${DOCK_OFFSET + 24}px)`,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid var(--border-color)",
};
const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-main)",
};
const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  marginTop: 2,
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
const bodyStyle: React.CSSProperties = {
  overflowY: "auto",
  padding: 0,
};
