import { useEffect, useRef, useState } from "react";
import {
  composeShareImage,
  downloadCanvas,
  copyCanvas,
  type ShareCell,
} from "../chart-screenshot.js";

interface ShareButtonProps {
  cells: ShareCell[];
  cols: number;
}

function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function ShareButton({ cells, cols }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the dropdown on outside-click or Escape (mirrors Chart.tsx ruler).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filename = (): string => {
    const syms = Array.from(new Set(cells.map((c) => c.symbol)))
      .join("-")
      .replace(/[^\w-]/g, "");
    return `trading-app-${syms || "charts"}-${fileStamp()}.png`;
  };

  const handleDownload = async (): Promise<void> => {
    try {
      const canvas = composeShareImage({ cells, cols });
      if (!canvas) {
        setNote("No charts to capture");
        return;
      }
      await downloadCanvas(canvas, filename());
      setOpen(false);
    } catch {
      setNote("Screenshot failed");
    }
  };

  const handleCopy = async (): Promise<void> => {
    try {
      const canvas = composeShareImage({ cells, cols });
      if (!canvas) {
        setNote("No charts to capture");
        return;
      }
      const ok = await copyCanvas(canvas);
      if (ok) {
        setOpen(false);
      } else {
        // Clipboard blocked (perms / insecure context) — fall back to download.
        await downloadCanvas(canvas, filename());
        setNote("Clipboard blocked — downloaded instead");
      }
    } catch {
      setNote("Screenshot failed");
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        title="Share chart image"
        onClick={() => {
          setNote(null);
          setOpen((v) => !v);
        }}
        style={btnStyle}
      >
        📷 Share
      </button>
      {open && (
        <div style={menuStyle}>
          <button type="button" style={itemStyle} onClick={handleDownload}>
            Download PNG
          </button>
          <button type="button" style={itemStyle} onClick={handleCopy}>
            Copy Image
          </button>
          {note && <div style={noteStyle}>{note}</div>}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  border: "1px solid #30363d",
  borderRadius: 4,
  background: "#161b22",
  color: "#c9d1d9",
  cursor: "pointer",
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  right: 0,
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  minWidth: 150,
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 4,
  padding: 4,
  gap: 2,
  boxShadow: "0 4px 12px #0008",
};

const itemStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  textAlign: "left",
  border: "none",
  borderRadius: 3,
  background: "transparent",
  color: "#c9d1d9",
  cursor: "pointer",
};

const noteStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 11,
  color: "#8b949e",
};
