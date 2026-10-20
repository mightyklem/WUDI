import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/push/subscribe { token, keys } → remember this device.
 *
 * The public key is served from /api/push/key, which is a separate route because a GET on
 * this path would have meant two ways to ask the same question.
 *
 * The browser subscribes with a PushSubscription object; what the server stores is its
 * endpoint AND its keys, because the keys are what let the server encrypt a message for
 * that one browser. An endpoint on its own can never deliver anything.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = typeof body.token === 'string' ? body.token.trim() : '';
  if (!endpoint || !/^https:\/\//.test(endpoint)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  // The subscription's keys are what let the server encrypt a message for that one
  // browser. Storing the endpoint alone would produce a row that can never be used to
  // deliver anything.
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : null;
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : null;
  if (!p256dh || !auth) {
    return NextResponse.json({ error: 'Subscription keys are required' }, { status: 400 });
  }

  // One row per device. Re-subscribing from the same browser replaces the old endpoint,
  // which is what happens when somebody revokes permission and grants it again.
  await prisma.pushToken.upsert({
    where: { token: endpoint },
    create: { token: endpoint, userId, platform: 'web', p256dh, auth },
    update: { userId, platform: 'web', p256dh, auth },
  });

  return NextResponse.json({ ok: true });
}
