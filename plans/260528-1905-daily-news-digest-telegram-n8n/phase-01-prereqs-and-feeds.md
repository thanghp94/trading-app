# Phase 01 — Prerequisites & Feeds

**Priority:** High · **Status:** pending · Sets up resources Phase 2 references by id.

## Goal
Have a Telegram bot credential (trading-app bot) on n8n + confirmed OpenAI credential id + locked feed URL list before authoring the workflow.

## Steps
1. **Source trading-app Telegram values** from repo `.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). Reference by env-var name only; never print values to chat/logs.
2. **Create Telegram bot credential** on the n8n instance via REST:
   `POST /api/v1/credentials` (auth header from `N8N_API_KEY` shell env), body `{name:"Trading-App News Bot", type:"telegramApi", data:{accessToken: <from env>}}`. Capture returned `id` for Phase 2 Telegram node.
   - **If the API rejects credential create** (version-dependent): STOP, ask user to add a `telegramApi` credential named "Trading-App News Bot" in the n8n UI, then resume. Different-bot fallback cred id: `IFliqY8FOd63MHbl`.
3. **Reuse OpenAI HTTP credential** id `Tkj9LGBhiZCiYUgN` ("AuraRemind OpenAI Auth"). Listing creds is restricted on n8n; confirm indirectly by the Phase 3 test-run succeeding. Default model `gpt-4o-mini`.
4. **Lock feed list** (all verified HTTP 200):
   - World — `http://feeds.bbci.co.uk/news/world/rss.xml`
   - Finance — `https://www.cnbc.com/id/100003114/device/rss/rss.html` (CNBC Top News)
   - Market — `https://www.cnbc.com/id/20910258/device/rss/rss.html` (CNBC Markets)
   - Market 2 — `http://feeds.marketwatch.com/marketwatch/topstories/`
   - AI — `https://techcrunch.com/category/artificial-intelligence/feed/`
   - Macro query — `https://news.google.com/rss/search?q=stock+market+OR+federal+reserve+when:1d&hl=en-US&gl=US&ceid=US:en`

## Success criteria
- Telegram credential id obtained (or user-added confirmed).
- OpenAI cred id locked. Feed list finalized.

## Security
- Never echo bot token or n8n API key into chat, logs, or committed files. Credentials live only on the n8n instance.

## Risks
- Credential-create API restriction → manual UI fallback (above).
