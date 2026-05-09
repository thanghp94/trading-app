import type { Alert } from '../../shared/types.js';

/**
 * Generic outbound webhook. Reads ALERT_WEBHOOK_URLS env (comma-separated)
 * and POSTs every fired alert to each URL as JSON. Compatible with:
 *   - Discord: ALERT_WEBHOOK_URLS=https://discord.com/api/webhooks/ID/TOKEN
 *   - Slack:   incoming webhook URL
 *   - Generic: any HTTPS endpoint that accepts {alert: Alert} JSON
 *
 * Discord and Slack expect different payload shapes — we detect by URL
 * substring and shape accordingly. Other endpoints get the raw alert.
 */
export class WebhookBus {
  private urls: string[];

  constructor() {
    this.urls = (process.env.ALERT_WEBHOOK_URLS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  hasAny(): boolean {
    return this.urls.length > 0;
  }

  async send(alert: Alert): Promise<void> {
    await Promise.all(this.urls.map((url) => this.sendOne(url, alert).catch(() => {})));
  }

  private async sendOne(url: string, alert: Alert): Promise<void> {
    const body = url.includes('discord.com/api/webhooks')
      ? this.discordPayload(alert)
      : url.includes('hooks.slack.com')
        ? this.slackPayload(alert)
        : { alert };
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      /* swallow — webhook delivery is best-effort, not load-bearing */
    }
  }

  private discordPayload(a: Alert): unknown {
    const arrow = a.direction === 'bull' ? '🟢' : '🔴';
    return {
      content: `${arrow} **${a.headline}**\n\`\`\`Price: ${a.price}\nTime: ${new Date(a.time * 1000).toISOString().slice(0, 16)} UTC\nRule: ${a.rule}\`\`\``,
    };
  }

  private slackPayload(a: Alert): unknown {
    const arrow = a.direction === 'bull' ? ':large_green_circle:' : ':red_circle:';
    return {
      text: `${arrow} *${a.headline}*\n\`\`\`Price: ${a.price}\nTime: ${new Date(a.time * 1000).toISOString().slice(0, 16)} UTC\nRule: ${a.rule}\`\`\``,
    };
  }
}
