import { prisma } from '@/lib/db';
import type { Prisma } from '../generated/prisma';
import { emailEnabled, sendEmail } from '@/lib/email';
import { pushEnabled, sendPush } from '@/lib/push';

/**
 * Fan-out dispatcher (Phase 7). Every notification is ALWAYS stored in-app.
 * Email goes out only when Resend is configured (see lib/email.ts); Expo push only to
 * registered tokens. Returns which channels fired so callers/tests can assert delivery.
 * Termii SMS/WhatsApp plugs in here when show-up rate demands it.
 */
export type Channel = 'inapp' | 'email' | 'push';

/**
 * Only time-critical events get a push. Pushing everything trains people to dismiss the
 * app without reading, which costs us permission prompts later (FR-11.2).
 */
const PUSHABLE: string[] = [
  'new-training-from-followed',
  'session-starting',
  'certificate-issued',
  'payment-received',
  'report-received',
];

const PUSH_TITLES: Record<string, string> = {
  'new-training-from-followed': 'New training',
  'session-starting': 'Starting soon',
  'certificate-issued': 'Your certificate is ready',
  'payment-received': 'Payment received',
  'report-received': 'Thanks — we received your report',
};

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

  // Push fires only for events a user must act on soon; stored in-app regardless.
  if (PUSHABLE.includes(opts.type) && pushEnabled()) {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: opts.userIds } }, select: { token: true },
    });
    if (tokens.length) {
      const res = await sendPush({
        tokens: tokens.map((t) => t.token),
        title: PUSH_TITLES[opts.type] || 'Learnovize',
        body: opts.email?.subject || PUSH_TITLES[opts.type] || opts.type,
        data: (opts.payload || {}) as Record<string, unknown>,
      });
      // Only claim the channel if Expo accepted at least one ticket.
      if (res.sent > 0) channels.push('push');
    }
  }
  return { channels };
}
