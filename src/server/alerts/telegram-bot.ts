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
  private isPolling = false;
  private lastUpdateId = 0;

  constructor(private token: string, private chatId: string) {}

  async send(alert: Alert, buttons?: any): Promise<{ ok: boolean; reason?: string }> {
    const text = formatAlert(alert);
    const result = await this.tryOnce(text, buttons);
    if (result.ok) return result;

    await sleep(this.failureBackoffMs);
    const retry = await this.tryOnce(text, buttons);
    if (retry.ok) return retry;

    return { ok: false, reason: `dropped after retry: ${retry.reason ?? 'unknown'}` };
  }

  async sendMessage(text: string, buttons?: any): Promise<{ ok: boolean; reason?: string }> {
    return this.tryOnce(text, buttons);
  }

  private async tryOnce(text: string, buttons?: any): Promise<{ ok: boolean; reason?: string }> {
    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const body: any = { chat_id: this.chatId, text, parse_mode: 'Markdown' };
      if (buttons) body.reply_markup = buttons;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resText = await res.text().catch(() => '');
        return { ok: false, reason: `HTTP ${res.status}: ${resText.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  /**
   * Bắt đầu lắng nghe sự kiện bấm nút từ Telegram (Long polling)
   */
  startPolling(onAction: (action: string, alertId: string, messageId: number) => void) {
    if (this.isPolling) return;
    this.isPolling = true;
    
    // eslint-disable-next-line no-console
    console.log('[Telegram] Bắt đầu lắng nghe sự kiện nút bấm...');
    
    const poll = async () => {
      if (!this.isPolling) return;
      try {
        const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json() as any;
          if (data.ok && data.result) {
            for (const update of data.result) {
              this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
              if (update.callback_query) {
                const cb = update.callback_query;
                const dataStr = cb.data as string;
                const messageId = cb.message?.message_id;
                
                // Trả lời callback ngay lập tức để Telegram không xoay tròn loading
                await fetch(`https://api.telegram.org/bot${this.token}/answerCallbackQuery`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ callback_query_id: cb.id }),
                }).catch(() => {});

                if (dataStr.startsWith('exec:') && messageId) {
                  onAction('exec', dataStr.split(':')[1], messageId);
                } else if (dataStr === 'ignore' && messageId) {
                  onAction('ignore', '', messageId);
                }
              }
            }
          }
        }
      } catch (err) {
         // Ignore network errors on polling
      }
      
      // Tiếp tục vòng lặp
      setTimeout(poll, 1000);
    };
    
    void poll();
  }

  stopPolling() {
    this.isPolling = false;
  }

  async editMessage(messageId: number, text: string) {
    try {
      const url = `https://api.telegram.org/bot${this.token}/editMessageText`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          message_id: messageId,
          text,
          parse_mode: 'Markdown'
        }),
      });
    } catch (err) {
      console.error('[Telegram] editMessage error:', err);
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
