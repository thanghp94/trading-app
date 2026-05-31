import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import type {
  Alert,
  ClientMessage,
  ServerMessage,
  Timeframe,
} from "../shared/types.js";
import { SymbolManager } from "./symbol-manager.js";
import { ALL_RULES } from "./alerts/rules/index.js";
import {
  createDynamicRule,
  type StrategyConfig,
} from "./alerts/rules/dynamic-rule.js";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { AlertEngine } from "./alerts/alert-engine.js";
import {
  TelegramGate,
  formatDigest,
  gateConfigFromEnv,
} from "./alerts/telegram-gate.js";
import { analyzeChart } from "./ai/analyze.js";
import { registerChatRoute } from "./ai/chat.js";
import { JournalStore } from "./journal/store.js";
import { RiskGuards } from "./journal/risk-guards.js";
import {
  runBacktest,
  type BacktestRequest,
  type BacktestResult,
} from "./backtest/backtest-engine.js";
import { BacktestRunStore } from "./backtest/run-store.js";
import { runSweep, type SweepRequest } from "./backtest/sweep.js";
import { runPortfolio, type PortfolioRequest } from "./backtest/portfolio.js";
import { runSignalStudy } from "./signal-study/study-engine.js";
import { rankWatchlist } from "./scanner/watchlist-scanner.js";
import { WatchlistStore } from "./scanner/watchlist-store.js";
import { FundamentalsStore } from "./fundamentals/fundamentals-store.js";
import { OwnershipStore } from "./fundamentals/ownership-store.js";
import { CorpActionStore } from "./fundamentals/corp-action-store.js";
import { refreshSymbols } from "./fundamentals/refresh.js";
import { fetchFundamentals } from "./fundamentals/vnstock-client.js";
import { fetchOwnership } from "./fundamentals/ownership-client.js";
import { fetchCorpActions } from "./fundamentals/corp-action-client.js";
import { registerSymbolCacheRoute } from "./fundamentals/route.js";
import { runScreener } from "./screener/run.js";
import { enrichRows } from "./screener/fundamental-filter.js";
import { getUniverse } from "./scanner/universe.js";
import { EntradeAdapter } from "./adapters/entrade-adapter.js";
import { checkMtf } from "../shared/indicators/mtf.js";
import { SubscriberStore } from "./public-feed/subscribers.js";
import { AutoExecutor } from "./execution/auto-executor.js";
import { runCouncil } from "./ai/council/orchestrator.js";
import cron from "node-cron";
// @ts-ignore — .mjs script has no declaration file
import { runDailyReport } from "../../scripts/daily-report-service.mjs";
import { marketDataService } from "./market/market-data-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const AUTH_TOKEN = process.env.APP_AUTH_TOKEN ?? "";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../data");

const fastify = Fastify({ logger: true });

// Lập lịch báo cáo hàng ngày (15:15 Thứ 2 - Thứ 6)
cron.schedule("15 15 * * 1-5", () => {
  fastify.log.info("[cron] Bắt đầu chạy báo cáo Daily Summary...");
  runDailyReport().catch((err: unknown) =>
    fastify.log.error(err, "[cron] Lỗi chạy báo cáo"),
  );
});

await fastify.register(websocket);

const webDist = path.resolve(__dirname, "../web");
try {
  await fastify.register(fastifyStatic, { root: webDist });
} catch {
  fastify.log.info(
    "No built frontend found — running API/WS only (use `pnpm dev:web` for the UI).",
  );
}

const sockets = new Set<{ send: (msg: ServerMessage) => void }>();
const journal = new JournalStore();
const backtestRuns = new BacktestRunStore();
const subscribers = new SubscriberStore();
const watchlistStore = new WatchlistStore();
const fundamentalsStore = new FundamentalsStore();
const ownershipStore = new OwnershipStore();
const corpActionStore = new CorpActionStore();
const autoExecutor = new AutoExecutor();
const riskGuards = new RiskGuards(journal);

// Fundamentals/ownership cache TTL: one trading day. Refreshed nightly + on cache-miss.
const FUNDAMENTALS_TTL_SEC = 24 * 3600;

// Nightly refresh (after VN close + daily digest). Fundamentals pre-warm the whole
// scannable (tracked) universe so the screener reads cache instantly; ownership +
// corp-actions only cover the watchlist (per-ticker tabs, fine on-demand otherwise).
cron.schedule("30 16 * * 1-5", () => {
  const watchlist = watchlistStore.list().map((w) => w.symbol);
  const cronLogger = {
    info: (m: string) => fastify.log.info(m),
    warn: (m: string) => fastify.log.warn(m),
  };
  // Fundamentals: tracked universe ∪ watchlist (dedup), so screener coverage is warm.
  const fundUniverse = [...new Set([...getUniverse("tracked"), ...watchlist])];
  fastify.log.info(
    `[cron] Pre-warm fundamentals cho ${fundUniverse.length} mã (tracked ∪ watchlist)...`,
  );
  refreshSymbols(fundUniverse, fundamentalsStore, {
    fetcher: fetchFundamentals,
    logger: cronLogger,
    label: "fundamentals",
  }).catch((err: unknown) =>
    fastify.log.error(err, "[cron] Lỗi refresh fundamentals"),
  );
  if (watchlist.length === 0) return;
  refreshSymbols(watchlist, ownershipStore, {
    fetcher: fetchOwnership,
    logger: cronLogger,
    label: "ownership",
  }).catch((err: unknown) =>
    fastify.log.error(err, "[cron] Lỗi refresh ownership"),
  );
  refreshSymbols(watchlist, corpActionStore, {
    fetcher: fetchCorpActions,
    logger: cronLogger,
    label: "corp-actions",
  }).catch((err: unknown) =>
    fastify.log.error(err, "[cron] Lỗi refresh corp-actions"),
  );
});
fastify.log.info(`[exec] auto-execute mode: ${autoExecutor.getMode()}`);

let telegramBot: any = null;
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  const { TelegramBot } = await import("./alerts/telegram-bot.js");
  telegramBot = new TelegramBot(
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_CHAT_ID,
  );

  // Khởi động lắng nghe nút bấm Telegram
  telegramBot.startPolling(
    async (action: string, alertId: string, messageId: number) => {
      if (action === "ignore") {
        await telegramBot.editMessage(
          messageId,
          `❌ *ĐÃ BỎ QUA*\n_Bạn đã hủy lệnh này_`,
        );
        fastify.log.info("[Telegram] User ignored alert");
        return;
      }

      if (action === "exec") {
        // Tìm lại alert trong history
        const history = alertEngine.getHistory();
        const alert = history.find((a) => a.id === alertId);
        if (!alert) {
          await telegramBot.editMessage(
            messageId,
            `⚠️ *LỖI*\n_Không tìm thấy tín hiệu (có thể server vừa khởi động lại)_`,
          );
          return;
        }

        await telegramBot.editMessage(
          messageId,
          `⏳ *ĐANG XỬ LÝ LỆNH MUA...*\n_Mã: ${alert.symbol}_`,
        );

        try {
          const order = await autoExecutor.maybeExecute(alert);
          if (order && order.status === "placed") {
            // Re-tag the existing journal entry as 'bot' now that execution confirmed.
            const existing = journal.getByAlertId(alert.id);
            if (existing) journal.setSource(existing.id, "bot");
            else journal.logFromAlert(alert, "bot");
            const modeTxt =
              autoExecutor.getMode() === "dry-run"
                ? "[DRY-RUN/GIẢ LẬP]"
                : "[LIVE]";
            await telegramBot.editMessage(
              messageId,
              `✅ *ĐẶT LỆNH THÀNH CÔNG ${modeTxt}*\n\nMã: *${order.symbol}*\nSL: ${order.quantity}\nCắt lỗ (SL): ${order.sl.toLocaleString("vi-VN")}\nChốt lời (TP): ${order.tp.toLocaleString("vi-VN")}`,
            );
          } else if (order) {
            await telegramBot.editMessage(
              messageId,
              `❌ *ĐẶT LỆNH THẤT BẠI*\n\nMã: ${order.symbol}\nLý do: ${order.reason || "Bị từ chối"}`,
            );
          } else {
            await telegramBot.editMessage(
              messageId,
              `❌ *LỆNH BỊ BỎ QUA*\n\nLý do: Không thỏa mãn khối lượng tối thiểu hoặc cấu hình rủi ro.`,
            );
          }
        } catch (err: any) {
          await telegramBot.editMessage(
            messageId,
            `⚠️ *LỖI HỆ THỐNG*\n_${err.message}_`,
          );
        }
      }
    },
  );
}

const ANALYZE_ON_ALERT = process.env.ANALYZE_ON_ALERT === "true";

// Telegram urgency gate — high-tier alerts interrupt live (throttled per
// symbol + globally), low-tier alerts batch into a periodic digest so the
// phone isn't spammed. Flush interval in minutes (default 60).
const telegramGate = new TelegramGate(gateConfigFromEnv(process.env));
const DIGEST_INTERVAL_MIN = Number(
  process.env.TELEGRAM_DIGEST_INTERVAL_MIN ?? 60,
);
if (telegramBot) {
  setInterval(
    () => {
      const buffered = telegramGate.drainBuffer();
      if (buffered.length === 0) return;
      telegramBot
        .sendMessage(formatDigest(buffered))
        .catch((err: any) =>
          fastify.log.error(err, "[Telegram] digest flush failed"),
        );
    },
    DIGEST_INTERVAL_MIN * 60 * 1000,
  );
}

const broadcastAlert = (alert: Alert) => {
  const blocked = riskGuards.check();
  if (blocked) {
    fastify.log.warn(`[risk] alert suppressed: ${blocked}`);
    // Still broadcast to UI so user sees what was filtered, but tag it.
    const tagged: Alert = {
      ...alert,
      headline: `[BLOCKED: ${blocked}] ${alert.headline}`,
    };
    const msg: ServerMessage = { type: "alert", alert: tagged };
    for (const s of sockets) s.send(msg);
    return;
  }

  // Annotate alert with MTF context...
  try {
    const stream = alertEngine
      .snapshots()
      .find(
        (s) => s.symbol === alert.symbol && s.timeframe === alert.timeframe,
      );
    if (stream) {
      const entryIdx = stream.candles.findIndex((c) => c.time === alert.time);
      if (entryIdx >= 0) {
        const m = checkMtf({
          baseCandles: stream.candles,
          baseTf: alert.timeframe,
          entryIdx,
          direction: alert.direction,
        });
        alert.meta = {
          ...(alert.meta ?? {}),
          mtfTrend: m.trend,
          mtfZone: m.zone,
          mtfHtf: m.htf,
        };
        const tag =
          m.trend === "aligned" && m.zone === "aligned"
            ? "✅"
            : m.trend === "mismatch"
              ? "⚠ MTF mismatch"
              : "";
        if (tag) alert.headline = `${alert.headline} · ${tag}`;
      }
    }
  } catch (err) {
    fastify.log.warn({ err }, "[alerts] mtf check failed");
  }

  const msg: ServerMessage = { type: "alert", alert };
  for (const s of sockets) s.send(msg);

  try {
    journal.logFromAlert(alert);
  } catch (err) {
    fastify.log.error({ err }, "[journal] log failed");
  }

  // Gửi Telegram kèm nút bấm nếu thỏa mãn cấu hình Auto-Execute
  if (telegramBot) {
    const isAllowed = autoExecutor.allowedFor?.(alert) ?? true;
    // Urgency gate: only high-tier alerts interrupt live. Low-tier and
    // throttled alerts are buffered into the periodic digest instead.
    const gate = telegramGate.decide(alert);
    if (gate.action !== "send") {
      fastify.log.info(
        `[Telegram] ${gate.action} (${gate.tier}${gate.reason ? "/" + gate.reason : ""}): ${alert.symbol} ${alert.rule}`,
      );
    }
    if (isAllowed && gate.action === "send") {
      const isDerivative = /^VN30F/i.test(alert.symbol);
      const side = alert.direction === "bull" ? "Mua" : "Bán";

      // Chỉ hiện nút Mua cho cổ phiếu VN (trừ phái sinh mới có nút Bán)
      if (isDerivative || alert.direction === "bull") {
        const buttons = {
          inline_keyboard: [
            [
              {
                text: `🚀 Duyệt ${side} ${alert.symbol}`,
                callback_data: `exec:${alert.id}`,
              },
              { text: "❌ Bỏ qua", callback_data: "ignore" },
            ],
          ],
        };
        telegramBot
          .send(alert, buttons)
          .catch((err: any) =>
            fastify.log.error(err, "[Telegram] send failed"),
          );
      } else {
        telegramBot
          .send(alert)
          .catch((err: any) =>
            fastify.log.error(err, "[Telegram] send failed"),
          );
      }
    }
  }

  // Async AI auto-analyze: fetch the evaluator's recent state and ask Claude
  // for a 5-sentence read. Result is broadcast as an alert-update so any
  // connected client can attach the summary to the alert in their panel.
  if (ANALYZE_ON_ALERT) {
    void (async () => {
      try {
        const snapshots = alertEngine.snapshots();
        const stream = snapshots.find(
          (s) => s.symbol === alert.symbol && s.timeframe === alert.timeframe,
        );
        if (!stream) return;
        const { computeZones } =
          await import("../shared/indicators/sr-zone-tracker.js");
        const { computeWaves } =
          await import("../shared/indicators/wave-counter.js");
        const zones = computeZones(stream.candles);
        const waves = computeWaves(stream.candles);
        const ai = await analyzeChart({
          symbol: alert.symbol,
          timeframe: alert.timeframe,
          candles: stream.candles,
          zones,
          waves,
        });
        if (ai.ok && ai.text) {
          const updated: Alert = { ...alert, aiSummary: ai.text };
          const updateMsg: ServerMessage = { type: "alert", alert: updated };
          for (const s of sockets) s.send(updateMsg);
        }
      } catch (err) {
        fastify.log.error({ err }, "[alerts] auto-analyze failed");
      }
    })();
  }
};

const alertEngine = new AlertEngine(broadcastAlert);

const STRATEGIES_FILE = resolve(DATA_DIR, "strategies.json");
let dynamicStrategies: StrategyConfig[] = [];
if (existsSync(STRATEGIES_FILE)) {
  dynamicStrategies = JSON.parse(readFileSync(STRATEGIES_FILE, "utf-8"));
  dynamicStrategies.forEach((s) => ALL_RULES.push(createDynamicRule(s)));
}
function saveStrategies() {
  writeFileSync(STRATEGIES_FILE, JSON.stringify(dynamicStrategies, null, 2));
}

const symbolManager = new SymbolManager(
  (candle) => {
    const msg: ServerMessage = { type: "tick", candle };
    for (const s of sockets) s.send(msg);
    alertEngine.feed(candle);
  },
  (err) => fastify.log.error({ err }, "adapter error"),
  (depth) => {
    const msg: ServerMessage = { type: "depth", depth };
    for (const s of sockets) s.send(msg);
  },
);

const configured = AlertEngine.parseConfiguredSymbols();
for (const cfg of configured) {
  try {
    const seed = await symbolManager.subscribe(cfg);
    alertEngine.seed(cfg.symbol, cfg.timeframe, seed);
    fastify.log.info(`[alerts] subscribed: ${cfg.symbol} ${cfg.timeframe}`);
  } catch (err) {
    fastify.log.error(
      { err },
      `[alerts] failed to subscribe ${cfg.symbol}:${cfg.timeframe}`,
    );
  }
}

// Subscribe persisted watchlist pins on startup.
for (const pin of watchlistStore.list()) {
  const already = configured.some(
    (c) => c.symbol === pin.symbol && c.timeframe === pin.timeframe,
  );
  if (already) continue;
  try {
    const seed = await symbolManager.subscribe(pin);
    alertEngine.seed(pin.symbol, pin.timeframe, seed);
    fastify.log.info(`[watchlist] subscribed: ${pin.symbol} ${pin.timeframe}`);
  } catch (err) {
    fastify.log.warn(
      { err },
      `[watchlist] failed to subscribe ${pin.symbol}:${pin.timeframe}`,
    );
  }
}

fastify.get("/api/health", async () => ({ ok: true, ts: Date.now() }));
fastify.get("/api/alerts", async () => alertEngine.getHistory());

// AI chat — streaming endpoint with multi-provider fallback.
await registerChatRoute(fastify);

// AI analyze — proxies to Claude Haiku.
fastify.post("/api/analyze", async (req) => {
  return analyzeChart(req.body as Parameters<typeof analyzeChart>[0]);
});

// AI Trading Council — multi-agent pipeline (Haiku × 11 + Sonnet × 1, ~$0.03-0.05/call).
// Gate: disabled unless COUNCIL_ENABLED=true in env. Returns 404 when off.
if (process.env.COUNCIL_ENABLED === "true") {
  fastify.post("/api/council", async (req) => {
    const { symbol, timeframe } = req.body as {
      symbol: string;
      timeframe: Timeframe;
    };
    if (typeof symbol !== "string" || !symbol)
      return { ok: false, error: "symbol required" };
    const allowed = ["1m", "5m", "15m", "1h", "4h", "1d"];
    if (!allowed.includes(timeframe))
      return {
        ok: false,
        error: `timeframe must be one of ${allowed.join(",")}`,
      };
    return runCouncil({
      symbol,
      timeframe,
      alertEngine,
      getFundamentals: (s) => fundamentalsStore.get(s),
      getOwnership: (s) => ownershipStore.get(s),
    });
  });
}

// Journal — list, get, update, stats, csv.
fastify.get("/api/journal", async (req) => {
  const { source } = req.query as { source?: string };
  const validSource =
    source === "alert" || source === "bot" || source === "manual"
      ? source
      : undefined;
  return { trades: journal.list(100, validSource), stats: journal.stats() };
});
fastify.get("/api/journal/stats", async () => journal.stats());
fastify.patch("/api/journal/:id", async (req) => {
  const { id } = req.params as { id: string };
  return journal.update(id, req.body as Parameters<typeof journal.update>[1]);
});
fastify.post("/api/journal/market", async (req, reply) => {
  const { symbol, direction } = req.body as {
    symbol: string;
    direction: "bull" | "bear";
  };

  // Find current price from alertEngine's snapshots
  const snapshots = alertEngine.snapshots();
  const stream = snapshots.find((s) => s.symbol === symbol);

  if (!stream || stream.candles.length === 0) {
    reply.status(400);
    return { error: "Symbol not actively streaming or no price available" };
  }

  const currentPrice = stream.candles[stream.candles.length - 1].close;

  // Create a synthetic alert to log it
  const alert = {
    id: `market_${Date.now()}`,
    symbol,
    timeframe: stream.timeframe,
    direction,
    rule: "manual_market",
    time: Math.floor(Date.now() / 1000),
    price: currentPrice,
    headline: `Manual Market ${direction === "bull" ? "Buy" : "Sell"}`,
  };

  return journal.logFromAlert(alert, "manual");
});
fastify.get("/api/journal/csv", async (_req, reply) => {
  const trades = journal.list(10_000);
  const header =
    "id,alert_id,symbol,timeframe,direction,rule,entry_price,sl,tp,exit_price,outcome,r_multiple,notes,opened_at,closed_at\n";
  const rows = trades
    .map((t) =>
      [
        t.id,
        t.alert_id ?? "",
        t.symbol,
        t.timeframe,
        t.direction,
        t.rule ?? "",
        t.entry_price,
        t.sl ?? "",
        t.tp ?? "",
        t.exit_price ?? "",
        t.outcome,
        t.r_multiple ?? "",
        t.notes ?? "",
        t.opened_at,
        t.closed_at ?? "",
      ].join(","),
    )
    .join("\n");
  reply.header("Content-Type", "text/csv");
  reply.header("Content-Disposition", 'attachment; filename="journal.csv"');
  return header + rows;
});

// Strategies
fastify.get("/api/strategies", async () => dynamicStrategies);
fastify.post("/api/strategies", async (req) => {
  const strat = req.body as StrategyConfig;
  dynamicStrategies.push(strat);
  ALL_RULES.push(createDynamicRule(strat));
  saveStrategies();
  return { success: true };
});
fastify.delete("/api/strategies/:id", async (req) => {
  const { id } = req.params as { id: string };
  dynamicStrategies = dynamicStrategies.filter((s) => s.id !== id);
  const idx = ALL_RULES.findIndex((r) => r.key === `dynamic_${id}`);
  if (idx > -1) ALL_RULES.splice(idx, 1);
  saveStrategies();
  return { success: true };
});

// Backtest — replay rules + simulate trades against any candle history.
fastify.post("/api/backtest", async (req) =>
  runBacktest(req.body as BacktestRequest),
);

// VN backtest — server-side DNSE data fetch + backtest. No candles in body needed.
fastify.post("/api/backtest/vn", async (req, reply) => {
  if (!process.env.DNSE_API_KEY || !process.env.DNSE_API_SECRET) {
    reply.status(400);
    return { error: "DNSE_API_KEY and DNSE_API_SECRET not configured in .env" };
  }
  const { DnseAdapter } = await import("./adapters/dnse-adapter.js");
  const body = req.body as {
    symbol: string;
    timeframe: Timeframe;
    fromDate?: string; // YYYY-MM-DD
    toDate?: string;
    slMode?: string;
    slPct?: number;
    tpMode?: string;
    rrTarget?: number;
    maxBars?: number;
    riskPct?: number;
    startingBalance?: number;
    preferredOnly?: boolean;
    mtfTrendAlign?: boolean;
    mtfZoneConfluence?: boolean;
    // Realism pack overrides (null = use auto-default by symbol class)
    feeBps?: number;
    sellTaxBps?: number;
    lotSize?: number;
    settlementBars?: number;
    vnSessionFilter?: boolean;
    /** When true, ignore client overrides and use VN realistic defaults. */
    useVnDefaults?: boolean;
  };
  // Heuristic: VN30F1M / VN30F2M / *F1M / *F2M → futures (cash-settled,
  // no T+ settlement, 1-contract lots, lower fees). Everything else =
  // VN cash equity (T+2.5 settlement, 100-share lots, fee+tax stack).
  const isVnFuture = /F[12]M$/i.test(body.symbol);
  const vnDefaults = isVnFuture
    ? { feeBps: 5, sellTaxBps: 0, lotSize: 1, settlementBars: 0 }
    : {
        feeBps: 15,
        sellTaxBps: 10,
        lotSize: 100,
        settlementBars: body.timeframe === "1d" ? 3 : 0,
      };
  const useDef = body.useVnDefaults ?? true;
  const toSec = body.toDate
    ? Math.floor(new Date(body.toDate).getTime() / 1000) + 86400
    : Math.floor(Date.now() / 1000);
  const fromSec = body.fromDate
    ? Math.floor(new Date(body.fromDate).getTime() / 1000)
    : toSec - 365 * 86400;

  const adapter = new DnseAdapter(
    process.env.DNSE_API_KEY,
    process.env.DNSE_API_SECRET,
  );
  try {
    const candles = await adapter.fetchHistorical({
      symbol: body.symbol,
      timeframe: body.timeframe,
      limit: 50_000,
      sinceSec: fromSec,
    });
    // Trim to requested window
    const filtered = candles.filter(
      (c) => c.time >= fromSec && c.time <= toSec,
    );
    if (filtered.length < 50) {
      reply.status(400);
      return {
        error: `Only ${filtered.length} candles in range — too few to backtest.`,
      };
    }
    const result = runBacktest({
      symbol: body.symbol,
      timeframe: body.timeframe,
      candles: filtered,
      slMode: (body.slMode ?? "trigger-wick") as BacktestRequest["slMode"],
      slPct: body.slPct ?? 0.005,
      tpMode: (body.tpMode ?? "next-resistance") as BacktestRequest["tpMode"],
      rrTarget: body.rrTarget ?? 2,
      maxBars: body.maxBars ?? 30,
      riskPct: body.riskPct ?? 1,
      startingBalance: body.startingBalance ?? 10_000,
      preferredOnly: body.preferredOnly ?? false,
      mtfTrendAlign: body.mtfTrendAlign ?? false,
      mtfZoneConfluence: body.mtfZoneConfluence ?? false,
      feeBps: useDef ? vnDefaults.feeBps : (body.feeBps ?? 0),
      sellTaxBps: useDef ? vnDefaults.sellTaxBps : (body.sellTaxBps ?? 0),
      lotSize: useDef ? vnDefaults.lotSize : (body.lotSize ?? 1),
      settlementBars: useDef
        ? vnDefaults.settlementBars
        : (body.settlementBars ?? 0),
      vnSessionFilter: body.vnSessionFilter ?? (useDef && !isVnFuture),
    });
    // Send candles back so UI can render bars + trade markers. Cap at 5k to
    // keep payload sane on intraday windows.
    const candlesOut =
      filtered.length <= 5000 ? filtered : filtered.slice(-5000);
    return {
      ...result,
      candles: candlesOut,
      instrumentClass: isVnFuture ? "vn-future" : "vn-equity",
      appliedDefaults: useDef ? vnDefaults : null,
    };
  } finally {
    await adapter.close();
  }
});

// Signal study — TCBS-style forward-return event study. Server-fetches DNSE
// daily candles, runs every buy signal over history, returns avg-return +
// win-prob matrix per signal + per-signal drilldown detail. Daily-only (MVP).
fastify.post("/api/signal-study", async (req, reply) => {
  if (!process.env.DNSE_API_KEY || !process.env.DNSE_API_SECRET) {
    reply.status(400);
    return { error: "DNSE_API_KEY and DNSE_API_SECRET not configured in .env" };
  }
  const body = req.body as {
    symbol?: string;
    fromDate?: string; // YYYY-MM-DD
    toDate?: string;
  };
  const symbol = (body.symbol ?? "").trim().toUpperCase();
  if (!symbol) {
    reply.status(400);
    return { error: "symbol is required" };
  }
  const toSec = body.toDate
    ? Math.floor(new Date(body.toDate).getTime() / 1000) + 86400
    : Math.floor(Date.now() / 1000);
  // Default to 5 years of history (TCBS uses ~5y).
  const fromSec = body.fromDate
    ? Math.floor(new Date(body.fromDate).getTime() / 1000)
    : toSec - 5 * 365 * 86400;

  const { DnseAdapter } = await import("./adapters/dnse-adapter.js");
  const adapter = new DnseAdapter(
    process.env.DNSE_API_KEY,
    process.env.DNSE_API_SECRET,
  );
  try {
    const candles = await adapter.fetchHistorical({
      symbol,
      timeframe: "1d",
      limit: 50_000,
      sinceSec: fromSec,
    });
    const filtered = candles.filter(
      (c) => c.time >= fromSec && c.time <= toSec,
    );
    // Need enough history to reach the longest horizon (180) plus indicator warmup.
    if (filtered.length < 250) {
      reply.status(400);
      return {
        error: `Only ${filtered.length} daily bars in range — need ≥ 250 for the signal study.`,
      };
    }
    return runSignalStudy(symbol, filtered);
  } catch (e) {
    reply.status(400);
    return { error: String(e) };
  } finally {
    await adapter.close();
  }
});

// Param sweep + walk-forward — grid search over up to 3 axes with optional
// train/test split. Body provides candles directly (use /api/backtest/vn/sweep
// for server-fetched DNSE data).
fastify.post("/api/backtest/sweep", async (req, reply) => {
  try {
    return runSweep(req.body as SweepRequest);
  } catch (e) {
    reply.status(400);
    return { error: String(e) };
  }
});

fastify.post("/api/backtest/vn/sweep", async (req, reply) => {
  if (!process.env.DNSE_API_KEY || !process.env.DNSE_API_SECRET) {
    reply.status(400);
    return { error: "DNSE_API_KEY and DNSE_API_SECRET not configured" };
  }
  const { DnseAdapter } = await import("./adapters/dnse-adapter.js");
  const body = req.body as Omit<SweepRequest, "candles"> & {
    fromDate?: string;
    toDate?: string;
  };
  const toSec = body.toDate
    ? Math.floor(new Date(body.toDate).getTime() / 1000) + 86400
    : Math.floor(Date.now() / 1000);
  const fromSec = body.fromDate
    ? Math.floor(new Date(body.fromDate).getTime() / 1000)
    : toSec - 365 * 86400;
  const adapter = new DnseAdapter(
    process.env.DNSE_API_KEY,
    process.env.DNSE_API_SECRET,
  );
  try {
    const candles = await adapter.fetchHistorical({
      symbol: body.symbol,
      timeframe: body.timeframe,
      limit: 50_000,
      sinceSec: fromSec,
    });
    const filtered = candles.filter(
      (c) => c.time >= fromSec && c.time <= toSec,
    );
    if (filtered.length < 100) {
      reply.status(400);
      return { error: `Only ${filtered.length} candles — too few for sweep.` };
    }
    return runSweep({ ...body, candles: filtered });
  } catch (e) {
    reply.status(400);
    return { error: String(e) };
  } finally {
    await adapter.close();
  }
});

// Portfolio backtest — N symbols, equal-weight slice, merged equity curve.
fastify.post("/api/backtest/portfolio", async (req, reply) => {
  try {
    return runPortfolio(req.body as PortfolioRequest);
  } catch (e) {
    reply.status(400);
    return { error: String(e) };
  }
});

fastify.post("/api/backtest/vn/portfolio", async (req, reply) => {
  if (!process.env.DNSE_API_KEY || !process.env.DNSE_API_SECRET) {
    reply.status(400);
    return { error: "DNSE_API_KEY and DNSE_API_SECRET not configured" };
  }
  const { DnseAdapter } = await import("./adapters/dnse-adapter.js");
  const body = req.body as {
    symbols: string[];
    timeframe: Timeframe;
    fromDate?: string;
    toDate?: string;
    base: Partial<BacktestRequest>;
    startingBalance?: number;
  };
  if (!body.symbols?.length) {
    reply.status(400);
    return { error: "symbols required" };
  }
  if (body.symbols.length > 30) {
    reply.status(400);
    return { error: "max 30 symbols" };
  }
  const toSec = body.toDate
    ? Math.floor(new Date(body.toDate).getTime() / 1000) + 86400
    : Math.floor(Date.now() / 1000);
  const fromSec = body.fromDate
    ? Math.floor(new Date(body.fromDate).getTime() / 1000)
    : toSec - 365 * 86400;
  const adapter = new DnseAdapter(
    process.env.DNSE_API_KEY,
    process.env.DNSE_API_SECRET,
  );
  try {
    const symbolCandles: Record<
      string,
      Awaited<ReturnType<typeof adapter.fetchHistorical>>
    > = {};
    for (const sym of body.symbols) {
      const candles = await adapter.fetchHistorical({
        symbol: sym,
        timeframe: body.timeframe,
        limit: 50_000,
        sinceSec: fromSec,
      });
      symbolCandles[sym] = candles.filter(
        (c) => c.time >= fromSec && c.time <= toSec,
      );
    }
    return runPortfolio({
      symbolCandles,
      timeframe: body.timeframe,
      base: body.base ?? {},
      startingBalance: body.startingBalance,
    });
  } catch (e) {
    reply.status(400);
    return { error: String(e) };
  } finally {
    await adapter.close();
  }
});

// Backtest run persistence — save/list/get/delete saved runs for A/B compare.
fastify.get("/api/backtest/runs", async () => backtestRuns.list(100));
fastify.get("/api/backtest/runs/:id", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const run = backtestRuns.get(id);
  if (!run) {
    reply.status(404);
    return { error: "not found" };
  }
  return run;
});
fastify.post("/api/backtest/save", async (req, reply) => {
  const body = req.body as {
    label?: string;
    fromDate?: string | null;
    toDate?: string | null;
    config: Partial<BacktestRequest>;
    result: BacktestResult;
  };
  if (!body.result || !body.result.stats) {
    reply.status(400);
    return { error: "result required" };
  }
  return backtestRuns.save({
    label:
      body.label?.trim() ||
      `${body.result.symbol} ${body.result.timeframe} ${new Date().toISOString().slice(0, 16)}`,
    fromDate: body.fromDate,
    toDate: body.toDate,
    config: body.config ?? {},
    result: body.result,
  });
});
fastify.delete("/api/backtest/runs/:id", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const ok = backtestRuns.delete(id);
  if (!ok) {
    reply.status(404);
    return { error: "not found" };
  }
  return { ok: true };
});

// Watchlist scanner — score every active stream, return top setups.
fastify.get("/api/scan", async () => {
  const inputs = alertEngine.snapshots();
  return rankWatchlist(inputs, 30);
});

// QMV-style universe screener — scans VN30 / tracked on demand (daily bars),
// ranks by TA ★. Blackbox columns are display-only (OHLCV proxy). On-demand
// fetch via keyless Entrade; sequential to respect rate limits.
fastify.get("/api/screener", async (req) => {
  const { universe } = req.query as { universe?: string };
  const symbols = getUniverse(universe === "tracked" ? "tracked" : "vn30");
  const adapter = new EntradeAdapter();
  try {
    const rows = await runScreener(symbols, (s) =>
      adapter.fetchHistorical({ symbol: s, timeframe: "1d", limit: 400 }),
    );
    // Attach fundamentals from the nightly cache (no inline fetch — keeps scan fast).
    const enriched = enrichRows(rows, (s) => fundamentalsStore.get(s));
    return { rows: enriched, asOf: Date.now(), proxy: true };
  } finally {
    await adapter.close();
  }
});

// Pinned watchlist — persist symbols across restarts.
fastify.get("/api/watchlist", async () => watchlistStore.list());

fastify.post("/api/watchlist", async (req) => {
  const body = req.body as { symbols: string; timeframe?: Timeframe };
  if (!body.symbols) throw new Error("symbols required");
  const added = watchlistStore.add(body.symbols, body.timeframe ?? "1d");
  // Respond immediately — subscription (which fetches history) runs in background
  // so the client doesn't hang waiting for candle downloads.
  const existing = new Set(
    alertEngine.snapshots().map((s) => `${s.symbol}:${s.timeframe}`),
  );
  setImmediate(async () => {
    for (const pin of added) {
      if (existing.has(`${pin.symbol}:${pin.timeframe}`)) continue;
      try {
        const seed = await symbolManager.subscribe(pin);
        alertEngine.seed(pin.symbol, pin.timeframe, seed);
        fastify.log.info(
          `[watchlist] subscribed: ${pin.symbol} ${pin.timeframe}`,
        );
      } catch (err) {
        fastify.log.warn(
          { err },
          `[watchlist] subscribe failed: ${pin.symbol}`,
        );
      }
    }
  });
  return added;
});

fastify.delete("/api/watchlist/:symbol", async (req) => {
  const { symbol } = req.params as { symbol: string };
  watchlistStore.remove(symbol.toUpperCase());
  return { ok: true };
});

// Public alert feed — subscriber management + read endpoint.
fastify.get("/api/subscribers", async () => subscribers.list());
fastify.post("/api/subscribers", async (req) => {
  const body = req.body as {
    name?: string;
    symbols?: string;
    rules?: string;
    rateLimit?: number;
  };
  if (!body.name) throw new Error("name required");
  return subscribers.create(body.name, body);
});
fastify.delete("/api/subscribers/:token", async (req) => {
  const { token } = req.params as { token: string };
  subscribers.delete(token);
  return { ok: true };
});
fastify.get("/api/public/alerts", async (req, reply) => {
  const token = (req.query as { token?: string } | undefined)?.token ?? "";
  if (!token) {
    reply.code(401);
    return { error: "token required" };
  }
  const sub = subscribers.get(token);
  if (!sub) {
    reply.code(403);
    return { error: "invalid token" };
  }
  // Filter the in-memory alert history through the subscriber's rules.
  // We call consume() for each alert delivered so quotas are accurate.
  const all = alertEngine.getHistory();
  const out: Alert[] = [];
  for (const a of all) {
    if (subscribers.consume(token, a)) out.push(a);
  }
  return { name: sub.name, count: out.length, alerts: out };
});

// Auto-execution status + history (read-only).
fastify.get("/api/execution/mode", async () => ({
  mode: autoExecutor.getMode(),
}));
fastify.get("/api/execution/history", async () => autoExecutor.getHistory());

fastify.register(async (app) => {
  app.get("/ws", { websocket: true }, (connection: any, req) => {
    const socket = connection.socket || connection;
    fastify.log.info("New WS connection established");
    if (AUTH_TOKEN) {
      const provided = (req.headers["authorization"] ?? "").replace(
        /^Bearer\s+/i,
        "",
      );
      const fromQuery =
        (req.query as { token?: string } | undefined)?.token ?? "";
      if (provided !== AUTH_TOKEN && fromQuery !== AUTH_TOKEN) {
        socket.close(1008, "unauthorized");
        return;
      }
    }

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const handle = { send };
    sockets.add(handle);

    send({ type: "alert-history", alerts: alertEngine.getHistory() });

    socket.on("message", async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      fastify.log.info({ msg: String(raw) }, "ws message received");
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        send({ type: "error", message: "bad JSON" });
        return;
      }
      if (msg.type === "subscribe") {
        try {
          fastify.log.info(
            { symbol: msg.symbol, tf: msg.timeframe },
            "subscribing",
          );
          const candles = await symbolManager.subscribe({
            symbol: msg.symbol,
            timeframe: msg.timeframe,
          });
          fastify.log.info({ count: candles.length }, "sending snapshot");
          send({
            type: "snapshot",
            symbol: msg.symbol,
            timeframe: msg.timeframe,
            candles,
          });
          alertEngine.seed(msg.symbol, msg.timeframe, candles);
        } catch (err) {
          fastify.log.error({ err }, "subscribe error");
          send({ type: "error", message: (err as Error).message });
        }
      }
    });

    socket.on("close", () => {
      fastify.log.info("ws closed");
      sockets.delete(handle);
    });
  });
});

const shutdown = async () => {
  marketDataService.stop();
  await symbolManager.closeAll();
  await fastify.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ── Market Overview routes (served from in-memory cache, 30s TTL) ──────────
marketDataService.start();

fastify.get("/api/market/breadth", async (_req, reply) => {
  const cache = marketDataService.getCache();
  if (!cache) return reply.status(503).send({ error: "warming up" });
  return {
    stocks: cache.stocks,
    breadth: cache.breadth,
    updatedAt: cache.updatedAt,
  };
});

fastify.get("/api/market/liquidity", async (_req, reply) => {
  const cache = marketDataService.getCache();
  if (!cache) return reply.status(503).send({ error: "warming up" });
  return {
    today: cache.liquidity.today,
    yesterday: cache.liquidity.yesterday,
    updatedAt: cache.updatedAt,
  };
});

fastify.get("/api/market/foreign", async (_req, reply) => {
  const foreign = marketDataService.getForeign();
  if (!foreign) return reply.status(503).send({ error: "warming up" });
  return { flows: foreign.flows, updatedAt: foreign.updatedAt };
});

// ── Ticker detail — per-symbol 1m intraday (30s cache) ──────────────────────
interface IntradayCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
const intradayCache = new Map<
  string,
  { candles: IntradayCandle[]; updatedAt: number }
>();
const INTRADAY_TTL_MS = 30_000;

fastify.get("/api/ticker/:symbol/intraday", async (req, reply) => {
  const { symbol } = req.params as { symbol: string };
  const sym = symbol.toUpperCase();
  const cached = intradayCache.get(sym);
  if (cached && Date.now() - cached.updatedAt < INTRADAY_TTL_MS) return cached;

  const now = Math.floor(Date.now() / 1000);
  const todayStart = now - (now % 86400) + 2 * 3600; // 02:00 UTC = 09:00 ICT
  const url =
    `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock` +
    `?symbol=${sym}&resolution=1&from=${todayStart}&to=${now}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return reply.status(502).send({ error: "upstream failed" });
    const json = (await res.json()) as {
      t?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      c?: number[];
      v?: number[];
    };
    const isDerivative = /^VN30F/i.test(sym);
    const scale = isDerivative ? 1 : 1000;
    const candles: IntradayCandle[] = (json.t ?? []).map((t, i) => ({
      time: t,
      open: (json.o?.[i] ?? 0) * scale,
      high: (json.h?.[i] ?? 0) * scale,
      low: (json.l?.[i] ?? 0) * scale,
      close: (json.c?.[i] ?? 0) * scale,
      volume: json.v?.[i] ?? 0,
    }));
    const entry = { candles, updatedAt: Date.now() };
    intradayCache.set(sym, entry);
    return entry;
  } catch {
    return reply.status(503).send({ error: "fetch failed" });
  }
});

registerSymbolCacheRoute(fastify, {
  path: "/api/fundamentals/:symbol",
  store: fundamentalsStore,
  ttlSec: FUNDAMENTALS_TTL_SEC,
  fetcher: fetchFundamentals,
  label: "fundamentals",
});
registerSymbolCacheRoute(fastify, {
  path: "/api/ownership/:symbol",
  store: ownershipStore,
  ttlSec: FUNDAMENTALS_TTL_SEC,
  fetcher: fetchOwnership,
  label: "ownership",
});
registerSymbolCacheRoute(fastify, {
  path: "/api/corp-actions/:symbol",
  store: corpActionStore,
  ttlSec: FUNDAMENTALS_TTL_SEC,
  fetcher: fetchCorpActions,
  label: "corp-actions",
});

// Node ≥15: unhandled rejections are fatal by default. Log and keep running
// so a single failed API call or adapter error doesn't kill the dev server.
process.on("unhandledRejection", (reason) => {
  fastify.log.error({ reason }, "[process] unhandledRejection — keeping alive");
});
process.on("uncaughtException", (err) => {
  fastify.log.error({ err }, "[process] uncaughtException — exiting");
  process.exit(1);
});

try {
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
