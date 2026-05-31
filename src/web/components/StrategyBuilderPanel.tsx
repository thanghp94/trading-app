import { useState, useEffect } from "react";
import type {
  StrategyConfig,
  StrategyCondition,
} from "../../server/alerts/rules/dynamic-rule.js";
import { Drawer } from "./Drawer.js";

export function StrategyBuilderPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [strategies, setStrategies] = useState<StrategyConfig[]>([]);

  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"bull" | "bear">("bull");
  const [indicator, setIndicator] = useState("price");
  const [operator, setOperator] = useState<
    "crosses_above" | "crosses_below" | "greater_than" | "less_than"
  >("crosses_above");
  const [value, setValue] = useState("ema20");

  useEffect(() => {
    fetch("/api/strategies")
      .then((r) => r.json())
      .then(setStrategies)
      .catch(() => {});
  }, []);

  const saveStrategy = async () => {
    if (!name) return;
    const cond: StrategyCondition = { indicator, operator, value };
    const strat: StrategyConfig = {
      id: Date.now().toString(),
      name,
      direction,
      conditions: [cond],
    };

    await fetch("/api/strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(strat),
    });

    setStrategies([...strategies, strat]);
    setName("");
  };

  const deleteStrategy = async (id: string) => {
    await fetch(`/api/strategies/${id}`, { method: "DELETE" });
    setStrategies(strategies.filter((s) => s.id !== id));
  };

  return (
    <Drawer
      open={open}
      title="⚙️ Strategy Builder"
      hint="Build alert rules — fire a signal when an indicator crosses a level."
      onClose={onClose}
      width={300}
    >
      <div style={contentStyle}>
        <div
          style={{
            marginBottom: 12,
            borderBottom: "1px solid var(--border-color)",
            paddingBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 8 }}>
            New Rule
          </div>

          <input
            placeholder="Strategy Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
              style={inputStyle}
            >
              <option value="bull">Buy</option>
              <option value="bear">Sell</option>
            </select>
            <span style={{ fontSize: 11, alignSelf: "center" }}>when</span>
          </div>

          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <select
              value={indicator}
              onChange={(e) => setIndicator(e.target.value)}
              style={inputStyle}
            >
              <option value="price">Price</option>
              <option value="ema20">EMA 20</option>
              <option value="ema50">EMA 50</option>
              <option value="ema200">EMA 200</option>
            </select>

            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as any)}
              style={inputStyle}
            >
              <option value="crosses_above">Crosses Above</option>
              <option value="crosses_below">Crosses Below</option>
              <option value="greater_than">&gt;</option>
              <option value="less_than">&lt;</option>
            </select>

            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={inputStyle}
            >
              <option value="ema20">EMA 20</option>
              <option value="ema50">EMA 50</option>
              <option value="ema200">EMA 200</option>
              <option value="price">Price</option>
            </select>
          </div>

          <button
            className="btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            onClick={saveStrategy}
          >
            Save Strategy
          </button>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>
            Active Strategies
          </div>
          {strategies.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              No strategies defined.
            </div>
          ) : (
            strategies.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  padding: "4px 0",
                }}
              >
                <span>
                  <span
                    style={{
                      color:
                        s.direction === "bull" ? "var(--bull)" : "var(--bear)",
                    }}
                  >
                    ●
                  </span>{" "}
                  {s.name}
                </span>
                <button
                  onClick={() => deleteStrategy(s.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#ef5350",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Drawer>
  );
}

const contentStyle: React.CSSProperties = {
  padding: 12,
};

const inputStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "inherit",
  background: "var(--bg-panel-solid)",
  color: "var(--text-main)",
  border: "1px solid var(--border-solid)",
  borderRadius: 3,
  padding: "4px",
  width: "100%",
};
