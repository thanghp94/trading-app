import type { Alert } from '../../shared/types.js';

export type ExecutionMode = 'off' | 'dry-run' | 'live';

export interface PlacedOrder {
  alertId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  /** Stop-loss price (computed from alert.price ± slPct). */
  sl: number;
  /** Take-profit price. */
  tp: number;
  status: 'placed' | 'failed' | 'skipped';
  reason?: string;
  /** ISO timestamp. */
  placedAt: string;
  /** When LIVE: the broker's order ID. When dry-run: a synthetic ID. */
  brokerOrderId: string;
}

export interface AutoExecutorConfig {
  mode: ExecutionMode;
  /** Allowlist of (rule, symbol) pairs. Wildcard "*" matches anything. */
  allow: Array<{ rule: string; symbol: string }>;
  /** Risk per trade in % of balance — same convention as the position sizer. */
  riskPct: number;
  /** SL distance as fraction of entry (e.g. 0.005 = 0.5%). */
  slPct: number;
  /** Reward:Risk multiple for TP. */
  rrTarget: number;
  /** Account balance baseline for sizing. */
  balance: number;
}

const DEFAULT_CONFIG: AutoExecutorConfig = {
  mode: 'off',
  allow: [],
  riskPct: 0.5,
  slPct: 0.005,
  rrTarget: 2,
  balance: 10_000,
};

/**
 * Optional auto-execution layer. SAFETY-FIRST:
 *
 *   - Default mode is 'off' — no orders placed, no logs.
 *   - 'dry-run' mode logs every would-be order to console + an in-memory
 *     buffer accessible via REST. Use this to verify your allowlist + risk
 *     parameters before risking real money.
 *   - 'live' mode requires explicit AUTO_EXECUTE_LIVE=true env in addition
 *     to AUTO_EXECUTE_MODE=live. This double-gate prevents an accidental
 *     env-var typo from triggering real orders.
 *
 * Live execution itself is left as a pluggable backend — `placeOrder` is
 * a stub that you wire to your broker (DNSE, MetaAPI, ccxt, etc.). The
 * provided implementation only logs; replace `placeLive` to actually fire.
 *
 * Allowlist semantics: the (rule, symbol) tuple of the fired alert must
 * appear in the allow list. Both fields support "*" wildcards.
 *
 * If you don't know what this does, leave AUTO_EXECUTE_MODE unset.
 */
export class AutoExecutor {
  private config: AutoExecutorConfig;
  private history: PlacedOrder[] = [];

  constructor() {
    this.config = AutoExecutor.parseEnv();
  }

  static parseEnv(): AutoExecutorConfig {
    const cfg: AutoExecutorConfig = { ...DEFAULT_CONFIG };
    const mode = (process.env.AUTO_EXECUTE_MODE ?? '').toLowerCase();
    if (mode === 'dry-run' || mode === 'dryrun') cfg.mode = 'dry-run';
    if (mode === 'live' && process.env.AUTO_EXECUTE_LIVE === 'true') cfg.mode = 'live';
    cfg.riskPct = numEnv('AUTO_EXECUTE_RISK_PCT', cfg.riskPct);
    cfg.slPct = numEnv('AUTO_EXECUTE_SL_PCT', cfg.slPct);
    cfg.rrTarget = numEnv('AUTO_EXECUTE_RR', cfg.rrTarget);
    cfg.balance = numEnv('AUTO_EXECUTE_BALANCE', cfg.balance);
    cfg.allow = (process.env.AUTO_EXECUTE_ALLOW ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [rule, symbol] = pair.split(':');
        return { rule: rule ?? '*', symbol: symbol ?? '*' };
      });
    return cfg;
  }

  getMode(): ExecutionMode {
    return this.config.mode;
  }

  getHistory(): PlacedOrder[] {
    return [...this.history];
  }

  /** Top-level entry: called from AlertEngine on each fired alert. */
  async maybeExecute(alert: Alert): Promise<PlacedOrder | null> {
    if (this.config.mode === 'off') return null;
    if (!this.allowedFor(alert)) return null;

    const isDerivative = /^VN30F/i.test(alert.symbol);
    const side: 'buy' | 'sell' = alert.direction === 'bull' ? 'buy' : 'sell';

    // Chứng khoán cơ sở VN (không phải phái sinh) chỉ được mua (Long)
    if (!isDerivative && side === 'sell') {
      // eslint-disable-next-line no-console
      console.log(`[exec] Skipped: Short selling not supported for VN stock ${alert.symbol}`);
      return null;
    }

    const slDist = Math.abs(alert.price * this.config.slPct);
    const sl = side === 'buy' ? alert.price - slDist : alert.price + slDist;
    const tp = side === 'buy' ? alert.price + slDist * this.config.rrTarget : alert.price - slDist * this.config.rrTarget;
    const riskAmount = this.config.balance * (this.config.riskPct / 100);

    // Tính số lượng và làm tròn xuống lô 100 cho cổ phiếu VN
    let quantity = riskAmount / slDist;
    if (!isDerivative) {
      quantity = Math.floor(quantity / 100) * 100;
      if (quantity < 100) {
        // eslint-disable-next-line no-console
        console.log(`[exec] Skipped: Quantity ${quantity.toFixed(0)} is less than 1 lot (100)`);
        return null;
      }
    } else {
      quantity = Math.floor(quantity); // Phái sinh VN30F tính theo hợp đồng (lô 1)
    }

    const draft: Omit<PlacedOrder, 'status' | 'reason' | 'brokerOrderId'> & { status?: PlacedOrder['status'] } = {
      alertId: alert.id,
      symbol: alert.symbol,
      side,
      quantity,
      sl,
      tp,
      placedAt: new Date().toISOString(),
    };

    if (this.config.mode === 'dry-run') {
      const order: PlacedOrder = { ...draft, status: 'placed', brokerOrderId: `dry-${Date.now()}` };
      // eslint-disable-next-line no-console
      console.log('[exec] DRY-RUN:', order);
      this.history.push(order);
      return order;
    }

    // LIVE mode — actual broker call. STUB. Wire to your broker.
    try {
      const order = await this.placeLive(draft);
      this.history.push(order);
      return order;
    } catch (err) {
      const failed: PlacedOrder = {
        ...draft,
        status: 'failed',
        reason: (err as Error).message,
        brokerOrderId: '',
      };
      this.history.push(failed);
      return failed;
    }
  }

  public allowedFor(alert: Alert): boolean {
    return this.config.allow.some(
      (a) => (a.rule === '*' || a.rule === alert.rule) && (a.symbol === '*' || a.symbol === alert.symbol),
    );
  }

  /**
   * STUB: replace with your broker integration.
   * Examples to wire here:
   *   - MetaAPI (MT5 broker bridge): https://metaapi.cloud/
   *   - ccxt (crypto): import { binance } from 'ccxt'; const ex = new binance({ ... }); await ex.createOrder(...)
   *   - DNSE Lightspeed: POST https://services.entrade.com.vn/dnse-order-service/v3/orders with JWT
   */
  private async placeLive(draft: Omit<PlacedOrder, 'status' | 'reason' | 'brokerOrderId'>): Promise<PlacedOrder> {
    // eslint-disable-next-line no-console
    console.warn(
      '[exec] LIVE mode is enabled but placeLive is unimplemented — order skipped. ' +
        'Wire your broker SDK in src/server/execution/auto-executor.ts → placeLive().',
    );
    return {
      ...draft,
      status: 'skipped',
      reason: 'placeLive is unimplemented — wire your broker SDK first',
      brokerOrderId: '',
    };
  }
}

function numEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
