# Phase 03 — Deploy, Activate, Verify

**Priority:** High · **Status:** pending · Depends on Phase 2 (validated JSON).

## Goal
Workflow live + active on the instance, proven by a real Telegram message landing in the trading-app chat.

## Steps
1. **Create** workflow:
   `POST https://auto.meraki.edu.vn/api/v1/workflows` (header from `N8N_API_KEY`), body = Phase 2 JSON (name, nodes, connections, settings). Capture returned workflow `id`.
   - n8n public API ignores `active` on create — must activate separately.
2. **Test-run BEFORE activating** (catch errors while cron is off):
   `POST /api/v1/workflows/{id}/run` if available; else trigger the MCP `execute_workflow` (executionMode `manual`) — workflow is now visible via API. Inspect execution: feeds fetched, OpenAI 200, Telegram 200.
   - If OpenAI errors → check model/quota on cred `Tkj9LGBhiZCiYUgN`.
   - If Telegram 400 (Markdown) → drop `parse_mode`, re-deploy via `PUT /api/v1/workflows/{id}`.
3. **Confirm receipt** — ask user to check Telegram for the brief. This is the real success gate (UI/feature correctness, not just HTTP 200).
4. **Activate** `POST /api/v1/workflows/{id}/activate`. Verify `GET /api/v1/workflows/{id}` shows `active:true`.
5. **Confirm cron** — schedule fires next at 06:00 Asia/Saigon (workflow `settings.timezone`).

## Success criteria
- `active:true`, manual run produced a readable EN digest in the trading-app Telegram chat.
- Next scheduled fire = 06:00 Asia/Saigon.

## Safety
- New workflow only — do NOT modify the other 6 existing workflows on the instance.
- Keep inactive until the test message is confirmed good.

## Risks
- Activation endpoint name varies by n8n version (`/activate` vs PATCH `active:true`). Try `/activate`, fall back to `PUT` with `active:true`.
- First scheduled run timezone mismatch → verify after activation.

## Post-deploy
Record workflow id + name in a short note; offer `/schedule`-style reminder only if a dated follow-up emerges (none expected).
