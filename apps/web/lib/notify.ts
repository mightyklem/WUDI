import { prisma } from '@/lib/db';
import type { Prisma } from '../generated/prisma';
import { emailEnabled, sendEmail } from '@/lib/email';

/**
 * Fan-out dispatcher (Phase 7). Every notification is ALWAYS stored in-app.
 * Email goes out only when Resend is configured (see lib/email.ts); Expo push only to
 * registered tokens. Returns which channels fired so callers/tests can assert delivery.
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

  if (opts.email && emailEnabled()) {
    const users = await prisma.user.findMany({
      where: { id: { in: opts.userIds } }, select: { id: true, email: true },
    });
    // One request per recipient so a single bad address can't fail the whole batch.
    const results = await Promise.all(
      users.map((u) => sendEmail({ ...opts.email!, to: u.email })),
    );
    // Only claim the channel if every send landed — a silent partial would hide a
    // broken domain or a bad address from the caller.
    if (results.length && results.every(Boolean)) channels.push('email');
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
