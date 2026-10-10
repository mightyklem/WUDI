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
      certificateNumber: certified.get(r.userId)?.number || null,
      certificateId: certified.get(r.userId)?.id || null,
    });
  }
  return NextResponse.json({
    training: { id, title: t.title, minPct: t.minPct, certMode: t.certMode },
    rows: rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.pct - a.pct),
  });
}
