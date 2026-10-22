import { prisma } from '@/lib/db';
import type { Prisma } from '../generated/prisma';
import { emailEnabled, sendEmail } from '@/lib/email';
import { pushEnabled, sendPush } from '@/lib/push';
import { sendWebPush, webPushEnabled } from '@/lib/push-web';
import { sendTermiiSms, sendTermiiWhatsapp, termiiEnabled } from '@/lib/termii';

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
    // Somebody asked a question and is waiting for an answer. That is the one kind of
    // message worth interrupting somebody for.
    'message-received',
  ];

  const PUSH_TITLES: Record<string, string> = {
    'new-training-from-followed': 'New training',
    'session-starting': 'Starting soon',
    'certificate-issued': 'Your certificate is ready',
    'payment-received': 'Payment received',
    'report-received': 'Thanks — we received your report',
    'message-received': 'New message',
  };


export async function notify(opts: {
    userIds: string[];
    type: string;
    payload?: Prisma.InputJsonValue;
    email?: { subject: string; text: string } | null;
    /**
     * The line under the title on a push, and where the push lands.
     *
     * A message is pushed but not emailed: a person asking a trainer a question is
     * worth interrupting somebody for, and a message is not worth putting in their
     * inbox. The wording and the destination are given here rather than being taken
     * from the email, because there is no email.
     */
    push?: { body: string; url?: string };
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

if (PUSHABLE.includes(opts.type) && termiiEnabled() && opts.email) {
    const users = await prisma.user.findMany({
      where: { id: { in: opts.userIds } }, select: { id: true, email: true, phone: true },
    });
    for (const u of users) {
      if (!u.phone) continue;
      // SMS first (transactional DND); WhatsApp only when ops has opted in.
      await sendTermiiSms({ to: u.phone, text: opts.email.text });
      await sendTermiiWhatsapp({ to: u.phone, text: opts.email.text });
    }
  }

  // Push fires only for events a user must act on soon; stored in-app regardless.
  //
  // Two channels, because a learner and a trainer are not always on the same kind of
  // device. Expo covers the native app; web push covers the browser, which is where most
  // people actually are -- the app is a separate project with its own credentials and is
  // not what anybody is using today.
  if (PUSHABLE.includes(opts.type)) {
    const title = PUSH_TITLES[opts.type] || 'Learnovize';

    if (pushEnabled()) {
      const tokens = await prisma.pushToken.findMany({
        where: { userId: { in: opts.userIds } }, select: { token: true },
      });
      if (tokens.length) {
          const res = await sendPush({
            tokens: tokens.map((t) => t.token),
            title,
            body: opts.push?.body || opts.email?.subject || title,
            data: (opts.payload || {}) as Record<string, unknown>,
          });

        // Only claim the channel if Expo accepted at least one ticket.
        if (res.sent > 0) channels.push('push');
      }
    }

    if (webPushEnabled()) {
      // Only web subscription endpoints -- an Expo token sent to a VAPID endpoint is a
      // guaranteed failure, and the provider answers with a 404 that would then get the
      // token deleted, breaking the native app's delivery.
      const webTokens = await prisma.pushToken.findMany({
        where: { userId: { in: opts.userIds }, platform: 'web' },
        select: { token: true, p256dh: true, auth: true },
      });
      const usable = webTokens.filter((t) => t.p256dh && t.auth);
      if (usable.length) {
          const sent = await sendWebPush({
            tokens: usable.map((t) => ({
              endpoint: t.token, p256dh: t.p256dh as string, auth: t.auth as string,
            })),
            title,
            body: opts.push?.body || opts.email?.subject || title,
            url: opts.push?.url
              ? opts.push.url
              : (opts.payload as { trainingId?: string } | undefined)?.trainingId
                ? `/trainings/${(opts.payload as { trainingId: string }).trainingId}`
                : '/',

          tag: opts.type,
        });
        if (sent > 0) channels.push('push');
      }
    }
  }
  return { channels };
}
