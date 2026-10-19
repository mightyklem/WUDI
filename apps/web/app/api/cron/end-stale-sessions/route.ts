import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/end-stale-sessions
 *
 * Marks sessions as ended if they've passed their scheduled end time.
 * Call this periodically (e.g., every 5 minutes) via a cron service.
 *
 * Security: Requires a secret token to prevent abuse.
 */
export async function POST(_req: Request) {
  const authHeader = process.env.CRON_SECRET;
  const provided = (new URL(_req.url)).searchParams.get('secret');

  if (!authHeader || provided !== authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Find sessions that are past their scheduled end but not yet marked ended
  const staleSessions = await prisma.session.findMany({
    where: {
      endsAtUtc: { lt: new Date() },
      status: { in: ['scheduled', 'live'] },
    },
    select: { id: true, endsAtUtc: true, status: true },
  });

  if (staleSessions.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Update all stale sessions to ended
  const ids = staleSessions.map((s) => s.id);
  await prisma.session.updateMany({
    where: { id: { in: ids } },
    data: { status: 'ended', endedAtUtc: new Date() },
  });

  return NextResponse.json({ updated: staleSessions.length, ids });
}