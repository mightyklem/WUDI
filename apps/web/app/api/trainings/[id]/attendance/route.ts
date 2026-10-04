import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { programPct } from '@learnovize/shared';

export const dynamic = 'force-dynamic';

async function staffOf(req: Request, trainingId: string) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return null;
  const t = await prisma.training.findUnique({ where: { id: trainingId } });
  if (!t) return null;
  if (t.trainerId === userId) return { userId, training: t, role: 'trainer' as const };
  const mod = await prisma.moderator.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
  });
  if (mod && mod.status === 'active') return { userId, training: t, role: 'moderator' as const };
  return null;
}

// GET /api/trainings/[id]/attendance — trainer/moderator summary (FR-7.5).
// Per participant: per-session present flags, program %, min-met, pending corrections.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await staffOf(req, id);
  if (!staff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [sessions, regs, logs, pending] = await Promise.all([
    prisma.session.findMany({ where: { trainingId: id }, orderBy: { startsAtUtc: 'asc' } }),
    prisma.registration.findMany({
      where: { trainingId: id, status: 'active' },
      include: { user: { select: { email: true } } },
    }),
    prisma.attendanceLog.findMany({
      where: { session: { trainingId: id } },
    }),
    prisma.notification.findMany({
      where: { type: 'correction-request', payload: { path: ['trainingId'], equals: id } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  const byUser = new Map<string, Map<string, boolean>>();
  for (const l of logs) {
    if (!byUser.has(l.userId)) byUser.set(l.userId, new Map());
    byUser.get(l.userId)!.set(l.sessionId, l.present);
  }
  const rows = regs.map((r) => {
    const m = byUser.get(r.userId) || new Map();
    const flags = sessions.map((s) => ({ sessionId: s.id, present: m.get(s.id) ?? null }));
    const presentCount = flags.filter((f) => f.present).length;
    const pct = programPct(presentCount, sessions.length);
    return {
      userId: r.userId, email: r.user.email,
      flags, presentCount, total: sessions.length, pct,
      minMet: pct >= staff.training.minPct,
    };
  });
  return NextResponse.json({
    training: { id, minPct: staff.training.minPct, sessions: sessions.length },
    rows,
    correctionsPending: pending.map((n) => ({ id: n.id, ...(n.payload as object), createdAt: n.createdAt })),
  });
}
