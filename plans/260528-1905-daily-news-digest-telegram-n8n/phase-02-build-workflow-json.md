# Phase 02 — Build Workflow JSON

**Priority:** High · **Status:** pending · Depends on Phase 1 (credential ids, feed list).

## Goal
Author a complete, valid n8n workflow JSON ready to POST. Node types/versions match instance (verified from existing workflows).

## Node graph
1. **Schedule Trigger** `n8n-nodes-base.scheduleTrigger` v1.1 — cron `0 6 * * *`.
2. **Fetch feeds** `n8n-nodes-base.httpRequest` v4.2 — one node per feed (6), `responseFormat: text` (raw XML). Set `onError: continueRegularOutput` + `timeout: 15000` so one dead feed never aborts the run. All feed nodes wired from the trigger; outputs merge into the parser.
3. **Parse & consolidate** `n8n-nodes-base.code` v2 (JS) — for each input item: regex/`DOMParser`-free string parse of `<item>` blocks → `{title, link, source, pubDate}`. Filter pubDate within 24h (fallback: keep if unparseable). Cap ~8 items/feed. Tag each with its topic bucket. Emit a single JSON `{items:[...], counts:{...}}`. Tolerate empty input.
4. **OpenAI summarize** `n8n-nodes-base.httpRequest` v4.2 — `POST https://api.openai.com/v1/chat/completions`, `httpHeaderAuth` cred `Tkj9LGBhiZCiYUgN`, body model `gpt-4o-mini`, `temperature 0.3`. System prompt: "You are a market briefing editor. Summarize today's headlines into a concise English digest grouped under: 🌍 World, 💵 Finance & Markets, 🤖 AI. 3-6 bullets per section, one line each, most important first. End with a 1-sentence overall market tone. No preamble." User content = the consolidated list (title — source). Read back `choices[0].message.content`.
5. **Format for Telegram** `n8n-nodes-base.code` v2 — build message: header `📰 Daily Brief — {{date}}` + digest body. If length > 3900 chars, truncate body and append `…(trimmed)`. (Single message; KISS — no multi-part split in v1.)
6. **Send** `n8n-nodes-base.telegram` v1.2 — resource `message`, operation `sendMessage`, `chatId` = trading-app `TELEGRAM_CHAT_ID`, `text` from format node, `parse_mode: Markdown`, Telegram cred id from Phase 1.

## Connections
Trigger → all 6 HTTP feed nodes → Code(parse) [merge inputs] → OpenAI → Code(format) → Telegram.
(Feed HTTP nodes each connect to the parse Code node; n8n runs them and the Code node receives all items.)

## Workflow settings
`{executionOrder:"v1", timezone:"Asia/Saigon", saveManualExecutions:true}`. Name: `Daily News Digest → Telegram`.

## Validation
- JSON parses; every node has unique `id`+`name`, `position`, correct `typeVersion`.
- Code nodes use `$input.all()` (no `{{}}` expressions inside Code).
- httpRequest summarize node: `sendBody:true`, `contentType:json`, `specifyBody:json`.
- Telegram + OpenAI nodes carry correct `credentials` blocks.

## Success criteria
Valid workflow JSON object, all 6 feeds wired, credential ids embedded, EN topic-grouped prompt in place.

## Risks
- RSS string-parse brittle → keep regex permissive, skip unparseable items.
- Markdown parse errors in Telegram (unescaped `_`/`*`) → prefer plain headers/emoji; if Telegram 400s in Phase 3, switch `parse_mode` off.
