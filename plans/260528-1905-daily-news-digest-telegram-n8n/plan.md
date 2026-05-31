# Plan — Daily News Digest → Telegram (n8n)

## Goal
n8n workflow on `auto.meraki.edu.vn` fires daily 06:00 Asia/Saigon, fetches global macro / finance / market / AI news from free RSS feeds, AI-summarizes into one English digest, pushes to the trading-app Telegram chat. Deployed active.

## Key Decisions (resolved by scouting — see context)
- **Deploy mechanism:** n8n public REST API (`https://auto.meraki.edu.vn/api/v1`). MCP gateway exposes only `search/get/execute` — cannot create. `N8N_API_KEY` in shell env works (verified status 200). Create via `POST /api/v1/workflows`, activate via `POST /api/v1/workflows/{id}/activate`.
- **LLM:** reuse existing OpenAI HTTP credential on instance — `httpHeaderAuth` id `Tkj9LGBhiZCiYUgN` ("AuraRemind OpenAI Auth"). Call `https://api.openai.com/v1/chat/completions` via `httpRequest` node (matches existing instance pattern; no new key).
- **Telegram:** user wants trading-app bot/chat. Create new `telegramApi` credential from trading-app `.env` `TELEGRAM_BOT_TOKEN`; node `chatId` = `TELEGRAM_CHAT_ID`. (Existing AuraRemind Telegram cred id `IFliqY8FOd63MHbl` is a *different* bot — fallback only.)
- **Feeds (verified 200):** BBC World, CNBC Top News, CNBC Markets, MarketWatch Top Stories, TechCrunch AI, Google News "stock market" query. Drop Yahoo (ambiguous XML).
- **Schedule:** `scheduleTrigger` cron `0 6 * * *`; workflow `settings.timezone = "Asia/Saigon"` (do NOT rely on instance default).

## Architecture
```
Schedule Trigger (06:00 Asia/Saigon)
  → HTTP Request (per feed, RSS XML)  ── parallel fetch
  → Code: parse XML, dedupe, filter <24h, cap ~8/feed, build compact list
  → HTTP Request: OpenAI chat/completions (EN digest, grouped by topic)
  → Code: format Telegram text, split if >4096 chars
  → Telegram Send (trading-app chat, Markdown)
```

## Phases
| # | File | Focus | Status |
|---|------|-------|--------|
| 1 | [phase-01-prereqs-and-feeds.md](phase-01-prereqs-and-feeds.md) | Create Telegram cred, confirm OpenAI cred, lock feed list | ✅ done |
| 2 | [phase-02-build-workflow-json.md](phase-02-build-workflow-json.md) | Author + validate workflow JSON (nodes, code, prompt, connections) | ✅ done |
| 3 | [phase-03-deploy-activate-verify.md](phase-03-deploy-activate-verify.md) | POST to REST API, activate, manual test-run, confirm Telegram receipt | ✅ done |

## DELIVERED (2026-05-28)
- **Workflow id:** `7i8IxuJyqPgPNwct` — "Daily News Digest -> Telegram" — **active**, cron `0 6 * * *` Asia/Saigon.
- **Verified:** manual run exec #983 success → Telegram message_id 4677 delivered to chat.
- **n8n creds created:** Telegram `k0HC8dWRdhYTw1Kv` (trading-app bot), OpenAI httpHeaderAuth `AhH6VwtCvit0D6z3` (repo OPENAI_API_KEY).
- **Deviations:** (1) 6 feed nodes collapsed into one Code node using `this.helpers.httpRequest` (avoids multi-input merge). (2) Pre-existing `AuraRemind OpenAI Auth` was a placeholder key → created new cred from repo key. (3) Added Telegram `retryOnFail` (shared bot flood-control hardening).

## Dependencies
- Phase 2 needs credential ids from Phase 1.
- Phase 3 needs validated JSON from Phase 2.

## Risks
- **n8n public API may restrict credential creation** (version-dependent). Mitigation: if `POST /api/v1/credentials` rejected, user adds Telegram cred in UI once; rest stays automated. (Phase 1)
- **RSS feeds change/die.** Code node must tolerate empty/failed feed (skip, don't abort). (Phase 2)
- **Telegram 4096-char limit.** Split or trim in format step. (Phase 2)
- **OpenAI cred quota/model** — confirm model available on that key (default `gpt-4o-mini`). (Phase 1)

## Out of scope (v1)
Influencer feeds (X API paid), VN translation, per-ticker filtering, interactive buttons, error-alert workflow.
