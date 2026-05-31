# Trading App

Personal multi-chart trading app. See the design doc at
`~/.gstack/projects/thanghp94-meraki-payload-final/thanghuynh-main-design-20260509-192204.md`.

## Quickstart

```bash
pnpm install
cp .env.example .env   # edit APP_AUTH_TOKEN if you want WS auth
pnpm dev               # runs vite (5173) + fastify (3001) concurrently
open http://localhost:5173
```

You should see a live BTCUSDT 5m chart streaming from Binance.

### Fundamentals data layer (optional, VN equities)

The `GET /api/fundamentals/:symbol` route shells out to a Python `vnstock` script.
For local dev, create a venv and install the pinned dep:

```bash
python3 -m venv pyvenv
./pyvenv/bin/pip install -r requirements.txt   # vnstock==4.0.4
export PYTHON_BIN=pyvenv/bin/python            # point the server at it
```

Without it, fundamentals requests return 502 (cache serves stale if present);
everything else runs normally. The Docker image installs python3 + vnstock itself.

## Layout

```
src/
  shared/             # types shared between web and server (Candle, ServerMessage, …)
  server/
    index.ts          # Fastify entry — REST + WS
    symbol-manager.ts # routes (symbol, timeframe) → adapter
    adapters/
      base-data-adapter.ts   # abstract: REST backfill, validation, gap-fill, state
      binance-adapter.ts     # public Binance kline (no auth)
  web/
    index.html
    main.tsx
    App.tsx           # one-chart layout for W1.1
    use-feed.ts       # WS subscription hook (reconnecting)
    components/
      Chart.tsx       # lightweight-charts wrapper
tests/
  fixtures/           # candle JSON fixtures (W2.2)
```

## Roadmap (from design doc)

- **W1.1 — Foundation + Binance** ← we are here
- W1.2 — N×M grid + multi-symbol
- W2.1 — S/R zones + role-reversal coloring
- W2.2 — Impulse + wave-counter + fixture tests
- W3.1 — Alert engine + Telegram (text+link)
- W3.2 — VN broker integration (DNSE or SSI)
- W4 — Forex/gold + polish + deploy

## Notes

- WS auth uses a static bearer token (`APP_AUTH_TOKEN`). Bypassed if unset (dev convenience).
- Reconnect is handled both ends:
  - Backend → Binance via the adapter's exponential-backoff reconnect loop.
  - Browser → Backend via `reconnecting-websocket`.
- Bad candles (NaN, inverted, negative) are dropped at the adapter boundary.

## Deploy to a VPS

```bash
# On a fresh Ubuntu/Debian box with Docker installed:
git clone <your-repo> trading-app && cd trading-app
cp .env.example .env  # fill in TELEGRAM, ALERT_SYMBOLS, ANTHROPIC_API_KEY, TWELVEDATA_API_KEY
# Edit Caddyfile: replace trader.example.com with your domain (or use the
# self-signed :8443 block if you don't have a domain).
docker compose up -d --build
```

Caddy auto-provisions a Let's Encrypt cert on first HTTPS request. SQLite
journal lives in a docker volume (`data:/data`) so it survives image rebuilds.

## Backups

```bash
# On the VPS, add to /etc/cron.daily/backup-trader:
docker compose exec -T app sqlite3 /data/journal.db ".backup /data/journal-$(date +%F).db"
# Then rsync /var/lib/docker/volumes/<project>_data/_data/*.db to your local machine.
```

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | uptime ping |
| GET | `/api/alerts` | recent alert history |
| POST | `/api/analyze` | Claude Haiku read on a chart |
| POST | `/api/backtest` | replay rules + simulate trades |
| GET | `/api/scan` | rank all active streams |
| GET | `/api/journal` | trades + stats |
| GET | `/api/journal/csv` | CSV export |
| PATCH | `/api/journal/:id` | update SL/TP/exit/outcome |
| WS | `/ws` | tick stream + alerts (bearer auth optional) |

