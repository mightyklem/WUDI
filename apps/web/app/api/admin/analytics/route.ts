import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/analytics — PRD §10 success metrics, computed live:
// active trainers/trainings, regs per training, % trainings full,
// show-up % (registered who attended ≥1 session), certs issued + paid share,
// verify visits, return rate, revenue, classroom health proxy.
export async function GET(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [
    activeTrainers, trainingsMonth, trainings, regs, regsPerTraining,
    fullCount, attended, certs, paidCerts, visits, activeRegUsers, payments, sessionsEnded,
  ] = await Promise.all([
    prisma.training.groupBy({ by: ['trainerId'], where: { createdAt: { gte: monthAgo } } }),
    prisma.training.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.training.findMany({ select: { id: true, status: true } }),
    prisma.registration.count({ where: { status: 'active' } }),
    prisma.registration.groupBy({ by: ['trainingId'], where: { status: 'active' }, _count: { _all: true } }),
    prisma.training.count({ where: { status: 'full' } }),
    prisma.attendanceLog.groupBy({ by: ['userId'], where: { present: true } }),
    prisma.certificate.count({ where: { status: 'valid' } }),
    prisma.payment.count({ where: { status: 'paid' } }),
    prisma.verifyVisit.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.registration.findMany({ where: { status: 'active' }, select: { userId: true } }),
    prisma.payment.findMany({ where: { status: 'paid' }, select: { amountNgn: true, commissionNgn: true } }),
    prisma.session.count({ where: { status: 'ended' } }),
  ]);
  const attendedIds = new Set(attended.map((a) => a.userId));
  const registeredIds = new Set(activeRegUsers.map((r) => r.userId));
  const counts = new Map<string, number>();
  for (const r of activeRegUsers) counts.set(r.userId, (counts.get(r.userId) || 0) + 1);
  const repeatUsers = [...counts.values()].filter((c) => c > 1).length;
  const showedUp = [...registeredIds].filter((id) => attendedIds.has(id)).length;
  const avgRegs = regsPerTraining.length
    ? regsPerTraining.reduce((a, g) => a + g._count._all, 0) / regsPerTraining.length : 0;
  return NextResponse.json({
    activeTrainers30d: activeTrainers.length,
    trainings30d: trainingsMonth,
    regsPerTrainingAvg: Math.round(avgRegs * 10) / 10,
    pctTrainingsFull: trainings.length ? Math.round((fullCount / trainings.length) * 100) : 0,
    showUpPct: registeredIds.size ? Math.round((showedUp / registeredIds.size) * 100) : 0,
    certsIssued: certs,
    paidSharePct: certs ? Math.round((paidCerts / certs) * 100) : 0,
    verifyVisits: visits.map((v) => ({ status: v.status, count: v._count._all })),
    returnRatePct: registeredIds.size ? Math.round((repeatUsers / registeredIds.size) * 100) : 0,
    revenueNgn: payments.reduce((a, p) => a + p.amountNgn, 0),
    commissionNgn: payments.reduce((a, p) => a + p.commissionNgn, 0),
    sessionsEnded,
  });
}
