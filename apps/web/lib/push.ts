import { prisma } from '@/lib/db';

/**
 * Expo push delivery (ADR-004).
 *
 * Two-step protocol: POST /push/send returns *tickets* (accepted for delivery), then you
 * poll /push/getReceipts to learn what actually landed. Sending and confirming are
 * separate, so treating a 200 from /send as "delivered" is the classic mistake — it only
 * means Expo queued the message.
 *
 * Failed tickets must be handled or a bad token is retried forever, burning the account's
 * monthly quota. We delete DeviceNotRegistered tokens and back off the rest.
 */

const MAX_PER_REQUEST = 100; // Expo hard limit per send call
const MAX_RECEIPTS = 1000; // Expo hard limit per receipts call

/**
 * Expo API origin. Overridable so the send/prune/receipt paths can be tested without a
 * physical device or burning real quota. Loopback only — a deployed instance can never
 * be redirected to a third-party host by a stray env var.
 */
function expoApi(): string {
  const base = (process.env.EXPO_API_BASE || 'https://exp.host').replace(/\/$/, '');
  if (base === 'https://exp.host') return base;
  let host: string;
  try {
    host = new URL(base).hostname;
  } catch {
    throw new Error('EXPO_API_BASE is not a valid URL');
  }
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('EXPO_API_BASE may only point at localhost');
  }
  return base;
}

type ExpoMessage = { to: string; title: string; body: string; data?: Record<string, unknown> };
type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; id: string; message: string; details?: { error?: string } };

export function pushEnabled(): boolean {
  return Boolean(process.env.EXPO_ACCESS_TOKEN);
}

/** Expo tokens look like ExponentPushToken[xxx] or ExpoPushToken[xxx]. */
function isExpoToken(token: string): boolean {
  return /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

export type PushResult = {
  sent: number; failed: number; removedTokens: number; deferred: number;
};

/**
 * Send to a set of Expo tokens. De-duplicates, drops malformed tokens, and prunes
 * tokens the device has since discarded (uninstalled/reinstalled app).
 */
export async function sendPush(opts: {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, removedTokens: 0, deferred: 0 };
  if (!pushEnabled() || !opts.tokens.length) return result;

  const unique = [...new Set(opts.tokens.filter(isExpoToken))];
  if (!unique.length) return result;

  const projectId = process.env.EXPO_PROJECT_ID;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    'accept-encoding': 'gzip, deflate',
  };
  if (process.env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  const dead: string[] = [];
  for (let i = 0; i < unique.length; i += MAX_PER_REQUEST) {
    const batch = unique.slice(i, i + MAX_PER_REQUEST);
    try {
      const r = await fetch(`${expoApi()}/--/api/v2/push/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map((to) => ({
          to,
          title: opts.title,
          body: opts.body,
          data: opts.data || {},
          // Android needs a channel; iOS ignores it. Without a sound/sound-less field the
          // notification can arrive silently on some OEM builds.
          sound: 'default',
          priority: 'high',
          channelId: 'default',
          ...(projectId ? { _projectId: projectId } : {}),
        }))),
      });
      if (!r.ok) {
        result.failed += batch.length;
        result.deferred += batch.length;
        console.error('[push] send rejected:', r.status, (await r.text().catch(() => '')).slice(0, 200));
        continue;
      }
      const j = (await r.json()) as { data?: ExpoTicket[] };
      const tickets = j.data || [];
      // Expo returns one ticket per message, in request order.
      for (let k = 0; k < batch.length; k++) {
        const t = tickets[k];
        if (t?.status === 'ok') {
          result.sent += 1;
        } else {
          result.failed += 1;
          const code = t?.details?.error;
          if (code === 'DeviceNotRegistered') {
            dead.push(batch[k]);
          } else {
            // Rate limit, message too big, etc — keep the token, try again next time.
            result.deferred += 1;
          }
        }
      }
    } catch (e) {
      result.failed += batch.length;
      result.deferred += batch.length;
      console.error('[push] send failed:', e instanceof Error ? e.message : e);
    }
  }

  if (dead.length) {
    await prisma.pushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => undefined);
    result.removedTokens = dead.length;
    console.log('[push] pruned unregistered tokens:', dead.length);
  }
  return result;
}

/**
 * Confirm delivery for tickets from an earlier send. Call after a delay (Expo recommends
 * ~15 min) from a scheduled job; nothing in the request path waits this long.
 */
export async function getPushReceipts(ticketIds: string[]): Promise<Record<string, { status: string; message?: string }>> {
  if (!pushEnabled() || !ticketIds.length) return {};
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    'accept-encoding': 'gzip, deflate',
  };
  if (process.env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  try {
    const r = await fetch(`${expoApi()}/--/api/v2/push/getReceipts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: ticketIds.slice(0, MAX_RECEIPTS) }),
    });
    if (!r.ok) return {};
    const j = (await r.json()) as { data?: Record<string, { status: string; message?: string }> };
    return j.data || {};
  } catch {
    return {};
  }
}