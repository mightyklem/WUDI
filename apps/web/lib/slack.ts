/**
 * Slack alerts for human-on-call hooks.
 * One webhook URL keeps us simple and secure — no per-channel tokens to leak.
 */

export function slackEnabled(): boolean {
  return Boolean(process.env.SLACK_WEBHOOK_URL);
}

export async function sendSlackAlert(text: string, blocks?: unknown[]): Promise<boolean> {
  if (!process.env.SLACK_WEBHOOK_URL) return false;
  try {
    const r = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, ...(blocks ? { blocks } : {}) }),
    });
    if (!r.ok) {
      console.error('[slack] alert rejected:', r.status, (await r.text().catch(() => '')).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[slack] alert failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function flagAlert(opts: {
  targetType: string;
  targetId: string;
  openCount: number;
  reason?: string;
}): Promise<boolean> {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || ''}/admin`;
  return sendSlackAlert(
    `:rotating_light: Learnovize flag: *${opts.targetType}* \`${opts.targetId}\` has ${opts.openCount} open reports.${opts.reason ? ` Reason: _${opts.reason}_` : ''}`,
    [{
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'Open admin queue' },
        url: url || 'https://example.com/admin',
      }],
    }],
  );
}