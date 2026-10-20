import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { sendWebPush } from '@/lib/push-web';

export const dynamic = 'force-dynamic';

/**
 * POST /api/push/probe — send yourself a test notification.
 *
 * Two jobs. It is the only way to find out whether push is actually working on a device,
 * because the failure modes are all silent: a permission that was never granted, a
 * subscription the browser discarded, a VAPID key that does not match the one the browser
 * subscribed with.
 *
 * It also reports WHY a send failed, because "it did not arrive" is the least useful error
 * message ever invented.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.pushToken.findMany({
    where: { userId, platform: 'web' },
    select: { token: true, p256dh: true, auth: true },
  });
  const usable = rows.filter((r) => r.p256dh && r.auth);
  if (!usable.length) {
    return NextResponse.json({
      sent: 0,
      reason: 'No web subscription for this account. Turn notifications on from your account page first.',
    });
  }

  const sent = await sendWebPush({
    tokens: usable.map((r) => ({
      endpoint: r.token, p256dh: r.p256dh as string, auth: r.auth as string,
    })),
    title: 'Learnovize',
    body: 'Notifications are working. This is a test.',
    url: '/me/account',
    tag: 'learnovize-test',
  });

  return NextResponse.json({
    sent,
    reason: sent > 0 ? 'Delivered.' : 'The push provider did not accept it. The subscription may have been discarded by the browser.',
  });
}
