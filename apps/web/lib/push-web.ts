import { prisma } from '@/lib/db';

/**
 * Web push (VAPID), for the browser.
 *
 * This is a different channel from the Expo push in lib/push.ts, which is for the native
 * app and needs EXPO_ACCESS_TOKEN. They are not alternatives: a learner on a phone in a
 * browser gets a web push, a learner with the app installed gets an Expo push, and somebody
 * with both gets both.
 *
 * Everything here is best effort. A push that fails must never fail the action that caused
 * it: registering for a class still has to work with the phone in aeroplane mode. So every
 * send is wrapped, and a token the browser has thrown away is deleted rather than retried
 * forever.
 */

/** VAPID keys, from the environment. Absent means web push is simply switched off. */
function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT || 'mailto:notifications@learnovize.com',
  };
}

export function webPushEnabled(): boolean {
  return Boolean(vapid());
}

/** The public key the browser needs in order to subscribe. */
export function webPushPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

/**
 * Send one push to every web device this user has.
 *
 * Returns how many were delivered. Dead tokens are removed as they are found: a token the
 * browser has discarded is not going to work tomorrow either, and keeping it means sending
 * into a black hole on every notification forever.
 */
export async function sendWebPush(opts: {
  tokens: { endpoint: string; p256dh: string; auth: string }[];
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}): Promise<number> {
  const keys = vapid();
  if (!keys || !opts.tokens.length) return 0;

  // Imported lazily so a deployment without VAPID keys does not fail to boot on a missing
  // module, and so the import cost is not paid by requests that never push.
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body ?? '',
    url: opts.url ?? '/',
    tag: opts.tag ?? opts.title,
  });

  let delivered = 0;
  const dead: string[] = [];

  await Promise.all(
    opts.tokens.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          payload,
        );
        delivered++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404 and 410 mean the browser threw the subscription away. Anything else is a
        // transient network problem and the token is still good.
        if (status === 404 || status === 410) dead.push(t.endpoint);
      }
    }),
  );

  if (dead.length) {
    await prisma.pushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => undefined);
  }
  return delivered;
}

/**
 * Push without letting a failure reach the caller.
 *
 * The call sites are things like "seat confirmed" and "your class is starting", where the
 * notification is a courtesy and the actual work has already happened. A push provider being
 * down must not roll back a seat.
 */
export async function sendWebPushSafe(opts: {
  tokens: { endpoint: string; p256dh: string; auth: string }[];
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  try {
    await sendWebPush(opts);
  } catch {
    // Deliberately swallowed. See above.
  }
}
