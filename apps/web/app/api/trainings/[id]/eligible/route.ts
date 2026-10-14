import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { computeEligibility } from '@/lib/certs';

export const dynamic = 'force-dynamic';

// GET /api/trainings/[id]/eligible — trainer/mod only.
// Only attendance-qualifying (+ paid) participants; ineligible can never be certified (FR-8.2).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const t = await prisma.training.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const isTrainer = t.trainerId === actorId;
  const mod = await prisma.moderator.findUnique({
    where: { trainingId_userId: { trainingId: id, userId: actorId } },
  });
  if (!isTrainer && (!mod || mod.status !== 'active')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const regs = await prisma.registration.findMany({
    where: { trainingId: id, status: 'active' },
    include: { user: { select: { email: true } } },
  });
  const certs = await prisma.certificate.findMany({
    where: { trainingId: id, status: 'valid' }, select: { userId: true, number: true, id: true },
  });
  const certified = new Map(certs.map((c) => [c.userId, { number: c.number, id: c.id }]));

  // Per-session attendance, so the panel can be a corrections surface rather than a
  // summary of one. The attendance webhook mis-measures real cases -- a learner who
  // drops and rejoins used to have the earlier window discarded -- and the trainer is
  // the only person who knows whether that happened. They cannot fix what they cannot
  // see, so each learner's sessions come back individually rather than as a percentage.
  const sessions = await prisma.session.findMany({
    where: { trainingId: id },
    select: { id: true, dayId: true, startsAtUtc: true, endsAtUtc: true },
    orderBy: { startsAtUtc: 'asc' },
  });
  const logs = await prisma.attendanceLog.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) } },
    select: { sessionId: true, userId: true, present: true, stayedMs: true, correctedBy: true, correctionReason: true },
  });
  const logFor = new Map(logs.map((l) => [`${l.sessionId}:${l.userId}`, l]));

  const rows = [];
  for (const r of regs) {
    const e = await computeEligibility(id, r.userId);
    rows.push({
      userId: r.userId, email: r.user.email,
      pct: e.pct, presentCount: e.presentCount, total: e.total,
      minMet: e.minMet, paidOk: e.paidOk, eligible: e.eligible,
      // What a certificate for this learner would actually cover (FR-11).
      scopeLabel: e.scopeLabel,
      dayCount: e.dayIds.length,
      // Free days they attended but which are not on the certificate, so a trainer can
      // explain the gap instead of the learner discovering it on the PDF.
      excludedFreeDays: e.excludedFreeDays,
      attendance: sessions.map((s, i) => {
        const l = logFor.get(`${s.id}:${r.userId}`);
        return {
          sessionId: s.id,
          index: i + 1,
          startsAtUtc: s.startsAtUtc.toISOString(),
          present: l?.present ?? false,
          stayedMs: l?.stayedMs ?? 0,
          // Flagged so a corrected value is visibly different from a measured one --
          // otherwise a manual override is indistinguishable from the webhook's opinion.
          corrected: !!l?.correctedBy,
          correctionReason: l?.correctionReason ?? null,
        };
      }),
      certificateNumber: certified.get(r.userId)?.number || null,
      certificateId: certified.get(r.userId)?.id || null,
    });
  }
  return NextResponse.json({
    training: {
      id, title: t.title, minPct: t.minPct, certMode: t.certMode,
      sessions: sessions.map((s, i) => ({
        id: s.id, index: i + 1, startsAtUtc: s.startsAtUtc.toISOString(),
      })),
    },
    rows: rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.pct - a.pct),
  });
}
