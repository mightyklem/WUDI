import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/sessions?status=live — rooms staff can observe.
 *
 * This existed in spirit but not in practice. An admin who needed to settle a dispute had
 * to already hold the /classroom/<id> URL, and nothing anywhere listed which rooms were
 * open. Finding one meant asking a trainer for a link, or reading the database directly.
 * That is not observation on demand, which is what the role is for.
 *
 * Live rooms first, because those are the ones where joining now still matters. Recently
 * ended ones follow, because the common case is a complaint filed after the fact, and the
 * session has to be findable then too.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const sessions = await prisma.session.findMany({
    where: status ? { status } : { status: { in: ['live', 'scheduled', 'ended'] } },
    include: {
      training: { select: { id: true, title: true, trainerId: true, trainer: { select: { displayName: true } } } },
      _count: { select: { attendanceLogs: true } },
    },
    orderBy: { startsAtUtc: 'desc' },
    take: 60,
  });

  const now = Date.now();
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      startsAtUtc: s.startsAtUtc.toISOString(),
      endsAtUtc: s.endsAtUtc.toISOString(),
      admittedAtUtc: s.admittedAtUtc?.toISOString() ?? null,
      endedAtUtc: s.endedAtUtc?.toISOString() ?? null,
      // Whether the room is genuinely reachable right now. A room can sit at status
      // 'scheduled' for a week, so status alone is not the same question as "is this
      // happening now".
      joinable: s.status === 'live' || (s.status === 'scheduled' && now < s.endsAtUtc.getTime()),
      headcount: s._count.attendanceLogs,
      training: s.training,
    })),
  });
}