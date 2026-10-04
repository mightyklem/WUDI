import { prisma } from '@/lib/db';
import type { Prisma } from '../generated/prisma';

/**
 * Fan-out dispatcher (Phase 7). Every notification is ALWAYS stored in-app.
 * Email goes out only when EMAIL_* is configured; Expo push only to registered
 * tokens. Returns which channels fired so callers/tests can assert delivery.
 * Termii SMS/WhatsApp plugs in here when show-up rate demands it.
 */
export type Channel = 'inapp' | 'email' | 'push';

export async function notify(opts: {
  userIds: string[];
  type: string;
  payload?: Prisma.InputJsonValue;
  email?: { subject: string; text: string } | null;
}): Promise<{ channels: Channel[] }> {
  const channels: Channel[] = ['inapp'];
  if (!opts.userIds.length) return { channels: [] };
  await prisma.notification.createMany({
    data: opts.userIds.map((userId) => ({
      userId, type: opts.type, payload: opts.payload || {},
    })),
  });

  if (opts.email && process.env.EMAIL_FROM && process.env.EMAIL_API_URL) {
    try {
      const users = await prisma.user.findMany({
        where: { id: { in: opts.userIds } }, select: { id: true, email: true },
      });
      for (const u of users) {
        await fetch(process.env.EMAIL_API_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.EMAIL_API_KEY || ''}`,
          },
          body: JSON.stringify({ from: process.env.EMAIL_FROM, to: u.email, ...opts.email }),
        });
      }
      channels.push('email');
    } catch (e) {
      console.error('[notify] email failed, in-app kept:', e instanceof Error ? e.message : e);
    }
  }

  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: opts.userIds } }, select: { token: true },
    });
    if (tokens.length && process.env.EXPO_ACCESS_TOKEN) {
      const r = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(
          tokens.map((t) => ({
            to: t.token,
            title: 'Learnovize',
            body: opts.email?.subject || opts.type,
            data: opts.payload || {},
          })),
        ),
      });
      if (r.ok) channels.push('push');
    }
  } catch (e) {
    console.error('[notify] push failed, in-app kept:', e instanceof Error ? e.message : e);
  }
  return { channels };
}
