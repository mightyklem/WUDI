import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { programPct } from '@learnovize/shared';

export const dynamic = 'force-dynamic';

// GET /api/me/attendance?trainingId= — my progress (FR-7.6):
// per-session flags, %, min needed, sessions remaining, at-risk flag.
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const trainingId = searchParams.get('trainingId');
  if (!trainingId) return NextResponse.json({ error: 'trainingId required' }, { status: 400 });

  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: { sessions: { orderBy: { startsAtUtc: 'asc' } } },
  });
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const logs = await prisma.attendanceLog.findMany({
    where: { userId, session: { trainingId } },
  });
  const bySession = new Map(logs.map((l) => [l.sessionId, l.present]));
  const now = Date.now();
  const flags = training.sessions.map((s) => ({
    sessionId: s.id,
    present: bySession.get(s.id) ?? null,
    upcoming: s.endsAtUtc.getTime() > now,
  }));
  const presentCount = flags.filter((f) => f.present).length;
  const pct = programPct(presentCount, training.sessions.length);
  const remaining = flags.filter((f) => f.upcoming).length;
  // At risk while still fixable; failed once no sessions remain.
  const atRisk = pct < training.minPct && remaining > 0;
  const failed = pct < training.minPct && remaining === 0;
  return NextResponse.json({
    training: { id: training.id, title: training.title, minPct: training.minPct, total: training.sessions.length },
    flags, presentCount, pct, remaining, atRisk, failed,
    minMet: pct >= training.minPct,
  });
}
