import type { Alert } from '../../shared/types.js';

/**
 * Minimal Telegram bot wrapper — direct fetch to the Bot API, no telegraf
 * dependency. Personal-use scale doesn't need polling, command handlers,
 * or webhook plumbing — just the ability to push a message to one chat.
 *
 * Failure handling: log + retry once after 30s; mark dropped on second
 * failure (per the design doc).
 */
export class TelegramBot {
  private failureBackoffMs = 30_000;

  constructor(private token: string, private chatId: string) {}

  async send(alert: Alert): Promise<{ ok: boolean; reason?: string }> {
    const text = formatAlert(alert);
    const result = await this.tryOnce(text);
    if (result.ok) return result;

    // First failure — wait and retry once.
    await sleep(this.failureBackoffMs);
    const retry = await this.tryOnce(text);
    if (retry.ok) return retry;

    return { ok: false, reason: `dropped after retry: ${retry.reason ?? 'unknown'}` };
  }

  private async tryOnce(text: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'Markdown' }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, reason: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }
}

function formatAlert(a: Alert): string {
  const arrow = a.direction === 'bull' ? '🟢' : '🔴';
  const t = new Date(a.time * 1000).toISOString().replace('T', ' ').slice(0, 16);
  return `${arrow} *${a.headline}*\n\n` +
    `Price: \`${a.price}\`\n` +
    `Time: ${t} UTC\n` +
    `Rule: \`${a.rule}\``;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
