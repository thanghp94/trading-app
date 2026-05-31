import { useEffect, useRef, useMemo, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";

export interface StockSnapshot {
  symbol: string;
  sector: string;
  pctChange: number;
  price: number;
  refPrice: number;
  value: number;
}

export interface MarketBreadth {
  advance: number;
  decline: number;
  unchanged: number;
}

interface Props {
  stocks: StockSnapshot[] | null;
  breadth: MarketBreadth | null;
}

function heatColor(pct: number): string {
  if (pct >= 6.5) return "#00c853";
  if (pct >= 3) return "#388e3c";
  if (pct > 0.05) return "#2e7d32";
  if (pct >= -0.05) return "#424242";
  if (pct > -3) return "#c62828";
  if (pct > -6.5) return "#b71c1c";
  return "#7b0000";
}

function buildHierarchy(stocks: StockSnapshot[]) {
  const bySecter = new Map<string, StockSnapshot[]>();
  for (const s of stocks) {
    const arr = bySecter.get(s.sector) ?? [];
    arr.push(s);
    bySecter.set(s.sector, arr);
  }
  return {
    name: "root",
    children: [...bySecter.entries()].map(([sector, items]) => ({
      sector,
      children: items.map((s) => ({
        symbol: s.symbol,
        pctChange: s.pctChange,
        value: Math.max(s.value, 1),
      })),
    })),
  };
}

/** Simple SVG pie for advance/decline/unchanged. */
function BreadthPie({ breadth }: { breadth: MarketBreadth }) {
  const total = breadth.advance + breadth.decline + breadth.unchanged;
  if (total === 0) return null;

  const R = 36;
  const CX = 48;
  const CY = 48;

  function slice(
    start: number,
    end: number,
    color: string,
    label: string,
    count: number,
  ) {
    const a0 = (start / total) * 2 * Math.PI - Math.PI / 2;
    const a1 = (end / total) * 2 * Math.PI - Math.PI / 2;
    const x0 = CX + R * Math.cos(a0);
    const y0 = CY + R * Math.sin(a0);
    const x1 = CX + R * Math.cos(a1);
    const y1 = CY + R * Math.sin(a1);
    const large = end - start > total / 2 ? 1 : 0;
    const d = `M${CX},${CY} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`;
    const midA = ((start + end) / 2 / total) * 2 * Math.PI - Math.PI / 2;
    const lx = CX + (R + 14) * Math.cos(midA);
    const ly = CY + (R + 14) * Math.sin(midA);
    return (
      <g key={label}>
        <path d={d} fill={color} opacity={0.85} />
        {count > 0 && (
          <text
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: 8, fill: "#ccc", fontFamily: "monospace" }}
          >
            {count}
          </text>
        )}
      </g>
    );
  }

  const adv = breadth.advance;
  const dec = breadth.decline;
  const unc = breadth.unchanged;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <svg width={96} height={96}>
        {slice(0, adv, "#2e7d32", "Tăng", adv)}
        {slice(adv, adv + unc, "#616161", "Không đổi", unc)}
        {slice(adv + unc, total, "#c62828", "Giảm", dec)}
      </svg>
      <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#aaa" }}>
        <span style={{ color: "#4caf50" }}>▲ {adv}</span>
        <span style={{ color: "#888" }}>— {unc}</span>
        <span style={{ color: "#ef5350" }}>▼ {dec}</span>
      </div>
    </div>
  );
}

export function MarketTreemap({ stocks, breadth }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // ResizeObserver keeps dims in sync so treemap re-renders on container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    if (!stocks || stocks.length === 0) return null;
    return buildHierarchy(stocks);
  }, [stocks]);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const width = dims.w || containerRef.current?.clientWidth || 0;
    const height = dims.h || containerRef.current?.clientHeight || 0;
    const svg = svgRef.current;
    if (width === 0 || height === 0) return;

    // Clear previous render
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));

    const root = hierarchy<typeof data>(data as any)
      .sum((d: any) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    treemap<any>()
      .tile(treemapSquarify)
      .size([width, height])
      .padding(1)
      .paddingTop(16)(root);

    const ns = "http://www.w3.org/2000/svg";

    // Sector groups
    for (const sectorNode of root.children ?? []) {
      const sx = (sectorNode as any).x0;
      const sy = (sectorNode as any).y0;
      const sw = (sectorNode as any).x1 - sx;
      const sh = (sectorNode as any).y1 - sy;
      if (sw < 2 || sh < 2) continue;

      const g = document.createElementNS(ns, "g");
      svg.appendChild(g);

      // Sector background
      const bg = document.createElementNS(ns, "rect");
      bg.setAttribute("x", String(sx));
      bg.setAttribute("y", String(sy));
      bg.setAttribute("width", String(sw));
      bg.setAttribute("height", String(sh));
      bg.setAttribute("fill", "rgba(255,255,255,0.03)");
      bg.setAttribute("stroke", "#333");
      bg.setAttribute("stroke-width", "1");
      g.appendChild(bg);

      // Sector label
      if (sw > 40 && sh > 18) {
        const label = document.createElementNS(ns, "text");
        label.setAttribute("x", String(sx + 4));
        label.setAttribute("y", String(sy + 11));
        label.setAttribute("fill", "#999");
        label.setAttribute("font-size", "9");
        label.setAttribute("font-family", "sans-serif");
        label.textContent = (sectorNode.data as any).sector ?? "";
        g.appendChild(label);
      }

      // Stock cells
      for (const leaf of sectorNode.children ?? []) {
        const lx = (leaf as any).x0;
        const ly = (leaf as any).y0;
        const lw = (leaf as any).x1 - lx;
        const lh = (leaf as any).y1 - ly;
        if (lw < 2 || lh < 2) continue;

        const pct = (leaf.data as any).pctChange as number;
        const sym = (leaf.data as any).symbol as string;

        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", String(lx + 1));
        rect.setAttribute("y", String(ly + 1));
        rect.setAttribute("width", String(Math.max(0, lw - 2)));
        rect.setAttribute("height", String(Math.max(0, lh - 2)));
        rect.setAttribute("fill", heatColor(pct));
        rect.setAttribute("rx", "2");
        g.appendChild(rect);

        if (lw > 28 && lh > 14) {
          const symText = document.createElementNS(ns, "text");
          symText.setAttribute("x", String(lx + lw / 2));
          symText.setAttribute("y", String(ly + lh / 2 - (lh > 26 ? 5 : 0)));
          symText.setAttribute("text-anchor", "middle");
          symText.setAttribute("dominant-baseline", "middle");
          symText.setAttribute("fill", "#fff");
          symText.setAttribute("font-size", String(Math.min(11, lw / 4)));
          symText.setAttribute("font-family", "monospace");
          symText.setAttribute("font-weight", "600");
          symText.textContent = sym;
          g.appendChild(symText);
        }

        if (lh > 26 && lw > 28) {
          const pctText = document.createElementNS(ns, "text");
          pctText.setAttribute("x", String(lx + lw / 2));
          pctText.setAttribute("y", String(ly + lh / 2 + 8));
          pctText.setAttribute("text-anchor", "middle");
          pctText.setAttribute("dominant-baseline", "middle");
          pctText.setAttribute("fill", "rgba(255,255,255,0.8)");
          pctText.setAttribute("font-size", String(Math.min(9, lw / 5)));
          pctText.setAttribute("font-family", "monospace");
          pctText.textContent = `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
          g.appendChild(pctText);
        }
      }
    }
  }, [data, dims]);

  if (!stocks) {
    return (
      <div
        style={{
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {[80, 60, 40].map((h, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{ height: h, background: "#2a2a2a", borderRadius: 4 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 0,
      }}
    >
      {/* Top: pie + stats */}
      {breadth && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "8px 12px",
            borderBottom: "1px solid #2a2a2a",
          }}
        >
          <BreadthPie breadth={breadth} />
          <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.6 }}>
            <div>
              Tổng:{" "}
              <strong style={{ color: "#ddd" }}>
                {breadth.advance + breadth.decline + breadth.unchanged}
              </strong>{" "}
              mã
            </div>
            <div style={{ color: "#4caf50" }}>Tăng: {breadth.advance}</div>
            <div style={{ color: "#ef5350" }}>Giảm: {breadth.decline}</div>
            <div style={{ color: "#888" }}>Không đổi: {breadth.unchanged}</div>
          </div>
        </div>
      )}
      {/* Treemap */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: "relative", minHeight: 300 }}
      >
        <svg ref={svgRef} style={{ position: "absolute", inset: 0 }} />
      </div>
    </div>
  );
}
