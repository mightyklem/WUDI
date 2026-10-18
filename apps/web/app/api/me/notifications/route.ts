import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/me/notifications — inbox (confirmation / reminders / changes)
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ notifications });
}

/**
 * POST /api/me/notifications — mark read.
 *
 * The inbox had no way to acknowledge anything, so `readAt` was written by the database
 * default of never and the "N new" badge could only ever count up. A badge that only goes
 * up is a badge people stop reading, which quietly destroys the value of every alert this
 * system will send -- seat confirmations, at-risk warnings, class cancellations, reminders.
 *
 * Scoped to the caller's own rows by userId rather than by id list, so there is no path
 * here that can mark somebody else's mail as read, and no way to enumerate anyone else's.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ marked: count });
}
