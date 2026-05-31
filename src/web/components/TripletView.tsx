import { useState } from "react";
import { useFeed } from "../use-feed.js";
import { useZones } from "../use-zones.js";
import { useWaves } from "../use-waves.js";
import { useEmas } from "../use-emas.js";
import { useBollinger } from "../use-bollinger.js";
import { useRsi } from "../use-rsi.js";
import { useTripletReplay } from "../use-triplet-replay.js";
import { Chart } from "./Chart.js";
import type { ReplaySpeed } from "../use-replay.js";

interface TripletViewProps {
  symbol: string;
  /** Called when user clicks "Exit triplet" — returns to normal grid. */
  onExit: () => void;
}

const SPEEDS: ReplaySpeed[] = [1, 2, 5, 10, 20];

export function TripletView({ symbol, onExit }: TripletViewProps) {
  const h1Feed = useFeed({ symbol, timeframe: "1h" });
  const m15Feed = useFeed({ symbol, timeframe: "15m" });
  const m5Feed = useFeed({ symbol, timeframe: "5m" });

  const replay = useTripletReplay(m5Feed.candles);

  const h1Candles = replay.sliceCandles(h1Feed.candles);
  const m15Candles = replay.sliceCandles(m15Feed.candles);
  const m5Candles = replay.sliceCandles(m5Feed.candles);

  // Indicators run on sliced candles so they reflect historical state at cursor
  const h1Zones = useZones(h1Candles);
  const h1Waves = useWaves(h1Candles);
  const h1Emas = useEmas(h1Candles);
  const h1Bollinger = useBollinger(h1Candles);
  const h1Rsi = useRsi(h1Candles);

  const m15Zones = useZones(m15Candles);
  const m15Waves = useWaves(m15Candles);
  const m15Emas = useEmas(m15Candles);
  const m15Bollinger = useBollinger(m15Candles);
  const m15Rsi = useRsi(m15Candles);

  const m5Zones = useZones(m5Candles);
  const m5Waves = useWaves(m5Candles);
  const m5Emas = useEmas(m5Candles);
  const m5Bollinger = useBollinger(m5Candles);
  const m5Rsi = useRsi(m5Candles);

  // Overlay toggles — shared across all 3 charts, default off
  const [showEmas, setShowEmas] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const [showWaves, setShowWaves] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRsi, setShowRsi] = useState(false);

  const isReplay = replay.cursorTime !== null;
  const maxTime = m5Feed.candles[m5Feed.candles.length - 1]?.time ?? 0;
  const barsAhead =
    isReplay && maxTime > 0
      ? Math.round((maxTime - (replay.cursorTime ?? maxTime)) / 300)
      : 0;

  const cursorLabel =
    isReplay && replay.cursorTime
      ? new Date(replay.cursorTime * 1000)
          .toISOString()
          .slice(0, 16)
          .replace("T", " ") + " UTC"
      : "Live";

  const charts = [
    {
      label: "1H",
      candles: h1Candles,
      zones: h1Zones,
      waves: h1Waves,
      emas: h1Emas,
      bollinger: h1Bollinger,
      rsi: h1Rsi,
      status: h1Feed.status,
    },
    {
      label: "15m",
      candles: m15Candles,
      zones: m15Zones,
      waves: m15Waves,
      emas: m15Emas,
      bollinger: m15Bollinger,
      rsi: m15Rsi,
      status: m15Feed.status,
    },
    {
      label: "5m",
      candles: m5Candles,
      zones: m5Zones,
      waves: m5Waves,
      emas: m5Emas,
      bollinger: m5Bollinger,
      rsi: m5Rsi,
      status: m5Feed.status,
    },
  ] as const;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: "#0d1117",
      }}
    >
      {/* Shared toolbar */}
      <div style={toolbarStyle}>
        <span style={{ fontWeight: 600, color: "#e6edf3", marginRight: 4 }}>
          {symbol}
        </span>
        <span style={{ color: "#8b949e", fontSize: 11, marginRight: 6 }}>
          Triplet
        </span>

        {/* Overlay toggles */}
        {(
          [
            {
              label: "EMA",
              active: showEmas,
              toggle: () => setShowEmas((v) => !v),
            },
            {
              label: "Zones",
              active: showZones,
              toggle: () => setShowZones((v) => !v),
            },
            {
              label: "Waves",
              active: showWaves,
              toggle: () => setShowWaves((v) => !v),
            },
            {
              label: "BB",
              active: showBollinger,
              toggle: () => setShowBollinger((v) => !v),
            },
            {
              label: "RSI",
              active: showRsi,
              toggle: () => setShowRsi((v) => !v),
            },
          ] as const
        ).map(({ label, active, toggle }) => (
          <button
            key={label}
            type="button"
            onClick={toggle}
            style={{ ...btnStyle, ...(active ? activeStyle : {}) }}
          >
            {label}
          </button>
        ))}

        <span style={{ color: "#30363d", margin: "0 4px" }}>|</span>

        {/* Replay controls */}
        {!isReplay && (
          <button
            type="button"
            onClick={replay.enterReplay}
            title="Enter replay 50 bars back — or double-click any bar"
            style={btnStyle}
          >
            ⏺ Replay
          </button>
        )}
        {isReplay ? (
          <>
            <button
              type="button"
              onClick={replay.exit}
              style={{ ...btnStyle, background: "#1f6feb", color: "#fff" }}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => replay.step(-10)}
              title="Back 10 bars"
              style={btnStyle}
            >
              ⏪
            </button>
            <button
              type="button"
              onClick={() => replay.step(-1)}
              title="Back 1 bar"
              style={btnStyle}
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => replay.setPlaying(!replay.playing)}
              style={btnStyle}
            >
              {replay.playing ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              onClick={() => replay.step(1)}
              title="Forward 1 bar"
              style={btnStyle}
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => replay.step(10)}
              title="Forward 10 bars"
              style={btnStyle}
            >
              ⏩
            </button>
            <select
              value={replay.speed}
              onChange={(e) =>
                replay.setSpeed(Number(e.target.value) as ReplaySpeed)
              }
              style={selectStyle}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
            <span style={{ marginLeft: 6, color: "#8b949e", fontSize: 11 }}>
              {cursorLabel} · {barsAhead} bars ahead
            </span>
          </>
        ) : (
          <span style={{ color: "#3fb950", fontSize: 11 }}>● Live</span>
        )}

        <button
          type="button"
          onClick={onExit}
          style={{ ...btnStyle, marginLeft: "auto" }}
        >
          ✕ Exit triplet
        </button>
      </div>

      {/* 3-column chart grid */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          minHeight: 0,
          gap: 1,
        }}
      >
        {charts.map(
          (
            { label, candles, zones, waves, emas, bollinger, rsi, status },
            i,
          ) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                border: "1px solid #30363d",
              }}
            >
              <div style={tfLabelStyle}>
                {label}
                {status === "connecting" && (
                  <span style={{ color: "#f0883e", marginLeft: 4 }}>…</span>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <Chart
                  candles={candles}
                  zones={showZones ? zones : []}
                  waves={showWaves ? waves : []}
                  emas={showEmas ? emas : []}
                  bollinger={showBollinger ? bollinger : null}
                  rsi={showRsi ? rsi : null}
                  id={`triplet-${i}`}
                  symbol={symbol}
                  onBarClick={(time) => replay.enterAt(time)}
                />
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  borderBottom: "1px solid #30363d",
  background: "#161b22",
  flexShrink: 0,
};

const tfLabelStyle: React.CSSProperties = {
  padding: "2px 6px",
  fontSize: 11,
  color: "#8b949e",
  borderBottom: "1px solid #30363d",
  background: "#161b22",
  flexShrink: 0,
};

const btnStyle: React.CSSProperties = {
  padding: "2px 6px",
  fontSize: 11,
  fontFamily: "inherit",
  border: "1px solid #30363d",
  borderRadius: 3,
  background: "#161b22",
  color: "#c9d1d9",
  cursor: "pointer",
  minWidth: 24,
  lineHeight: 1.2,
};

const activeStyle: React.CSSProperties = {
  background: "#1f6feb33",
  borderColor: "#1f6feb",
  color: "#58a6ff",
};

const selectStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "inherit",
  padding: "1px 2px",
  background: "#0d1117",
  color: "#c9d1d9",
  border: "1px solid #30363d",
  borderRadius: 3,
  marginLeft: 2,
};
