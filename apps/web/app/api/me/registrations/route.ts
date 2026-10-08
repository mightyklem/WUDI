import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/me/registrations — my active registrations with training + sessions
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const regs = await prisma.registration.findMany({
    where: { userId, status: 'active' },
    include: {
      training: { include: { sessions: { orderBy: { startsAtUtc: 'asc' } } } },
    },
    orderBy: { training: { sessions: { _count: 'asc' } } },
  });
  return NextResponse.json({
    registrations: regs.map((r) => ({
      id: r.id,
      certPaid: r.certPaid,
      // The quote they were shown, so the amount never shifts under them.
      quotedPricePerDayNgn: r.quotedPricePerDayNgn,
      quotedDays: r.quotedDays,
      quotedTotalNgn: r.quotedTotalNgn,
      training: r.training,
    })),
  });
}
