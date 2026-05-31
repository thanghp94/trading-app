import type { AlertRule, RuleContext } from "../rule-types.js";
import { ema } from "../../../shared/indicators/ema.js";

export interface StrategyCondition {
  indicator: string;
  operator: "crosses_above" | "crosses_below" | "greater_than" | "less_than";
  value: string | number;
}

export interface StrategyConfig {
  id: string;
  name: string;
  conditions: StrategyCondition[];
  direction: "bull" | "bear";
}

export function createDynamicRule(config: StrategyConfig): AlertRule {
  return {
    key: `dynamic_${config.id}`,
    cooldownBars: 1,
    evaluate: (ctx: RuleContext) => {
      const { prev } = ctx;
      if (!prev || config.conditions.length === 0) return null;

      const getValue = (indicator: string | number, context: RuleContext) => {
        if (typeof indicator === "number") return indicator;
        if (!isNaN(Number(indicator))) return Number(indicator);
        if (indicator === "price") return context.candle.close;
        if (indicator.startsWith("ema")) {
          const period = parseInt(indicator.replace("ema", ""), 10);
          const e = ema(context.candles, period);
          return e[e.length - 1];
        }
        return 0;
      };

      let allTrue = true;
      for (const cond of config.conditions) {
        const currentVal = getValue(cond.indicator, ctx);
        const targetVal = getValue(cond.value, ctx);
        const prevVal = getValue(cond.indicator, prev);
        const prevTargetVal = getValue(cond.value, prev);

        if (cond.operator === "greater_than") {
          if (!(currentVal > targetVal)) allTrue = false;
        } else if (cond.operator === "less_than") {
          if (!(currentVal < targetVal)) allTrue = false;
        } else if (cond.operator === "crosses_above") {
          if (!(prevVal <= prevTargetVal && currentVal > targetVal))
            allTrue = false;
        } else if (cond.operator === "crosses_below") {
          if (!(prevVal >= prevTargetVal && currentVal < targetVal))
            allTrue = false;
        }
      }

      if (allTrue) {
        return {
          rule: config.name,
          direction: config.direction,
          headline: `Strategy Trigger: ${config.name}`,
        };
      }
      return null;
    },
  };
}
