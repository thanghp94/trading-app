import type { Alert, Candle, Timeframe } from '../../shared/types.js';
import { RuleEvaluator } from './rule-evaluator.js';
import { TelegramBot } from './telegram-bot.js';
import { WebhookBus } from './webhook-bus.js';

/**
 * Top-level alert orchestrator.
 *
 * - Maintains one RuleEvaluator per active (symbol, timeframe).
 * - Receives every candle from SymbolManager, routes to the right evaluator.
 * - When a rule fires: pushes to the in-memory ring buffer (UI history),
 *   broadcasts to all connected WS clients, sends to Telegram if configured.
 *
 * The "always-evaluate" symbol list comes from env var ALERT_SYMBOLS,
 * formatted as comma-separated `SYMBOL:TF` pairs:
 *
 *   ALERT_SYMBOLS=BTCUSDT:5m,ETHUSDT:15m,XAUUSD:1h
 *
 * On startup the engine subscribes to each pair via SymbolManager so they
 * stay live even when no UI is open.
 */
export class AlertEngine {
  private evaluators = new Map<string, RuleEvaluator>(); // key=`${symbol}:${tf}`
  private history: Alert[] = [];
  private maxHistory = 200;
  private telegram: TelegramBot | null;
  private webhooks: WebhookBus;

  constructor(private onBroadcast: (alert: Alert) => void) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    this.telegram = token && chatId ? new TelegramBot(token, chatId) : null;
    this.webhooks = new WebhookBus();
  }

  /** Snapshot every active evaluator's candle buffer — used by the scanner. */
  snapshots(): Array<{ symbol: string; timeframe: Timeframe; candles: Candle[] }> {
    return Array.from(this.evaluators.entries()).map(([key, ev]) => {
      const [symbol, timeframe] = key.split(':') as [string, Timeframe];
      return { symbol, timeframe, candles: ev.snapshot() };
    });
  }

  /** Parse ALERT_SYMBOLS env into a list of (symbol, tf). Empty if unset/invalid. */
  static parseConfiguredSymbols(): Array<{ symbol: string; timeframe: Timeframe }> {
    const raw = process.env.ALERT_SYMBOLS ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [symbol, tf] = pair.split(':');
        if (!symbol || !tf) return null;
        return { symbol: symbol.toUpperCase(), timeframe: tf as Timeframe };
      })
      .filter((x): x is { symbol: string; timeframe: Timeframe } => x !== null);
  }

  /** Ensure an evaluator exists for this stream. Idempotent. */
  ensure(symbol: string, timeframe: Timeframe): void {
    const key = `${symbol}:${timeframe}`;
    if (this.evaluators.has(key)) return;
    this.evaluators.set(key, new RuleEvaluator(symbol, timeframe, (a) => this.fire(a)));
  }

  /** Seed an evaluator with historical candles before the live stream kicks in. */
  seed(symbol: string, timeframe: Timeframe, candles: Candle[]): void {
    this.ensure(symbol, timeframe);
    this.evaluators.get(`${symbol}:${timeframe}`)!.seed(candles);
  }

  /** Route an incoming candle to the right evaluator (no-op if not configured). */
  feed(candle: Candle): void {
    const key = `${candle.symbol}:${candle.timeframe}`;
    this.evaluators.get(key)?.feed(candle);
  }

  /** Recent alerts for a fresh UI client to backfill its panel. */
  getHistory(): Alert[] {
    return [...this.history];
  }

  private fire(alert: Alert): void {
    this.history.push(alert);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.onBroadcast(alert);
    if (this.telegram) {
      void this.telegram.send(alert).then((res) => {
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.error(`[alerts] telegram failed: ${res.reason}`);
        }
      });
    }
    if (this.webhooks.hasAny()) {
      void this.webhooks.send(alert);
    }
  }
}
