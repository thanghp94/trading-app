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
