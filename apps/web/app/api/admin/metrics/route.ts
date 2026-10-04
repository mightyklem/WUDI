import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/metrics — platform activity at a glance (FR-12.3).
export async function GET(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const [
    users, trainers, trainings, trainingsLive, regs, payments, certsValid, certsRevoked, postsLive, postsHidden, reportsOpen, payoutsHeld,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.trainerProfile.count(),
    prisma.training.count(),
    prisma.training.count({ where: { status: 'live' } }),
    prisma.registration.count({ where: { status: 'active' } }),
    prisma.payment.findMany({ where: { status: 'paid' }, select: { amountNgn: true, commissionNgn: true } }),
    prisma.certificate.count({ where: { status: 'valid' } }),
    prisma.certificate.count({ where: { status: 'revoked' } }),
    prisma.feedPost.count({ where: { status: 'live' } }),
    prisma.feedPost.count({ where: { status: { in: ['hidden', 'removed'] } } }),
    prisma.report.count({ where: { status: 'open' } }),
    prisma.payout.aggregate({ where: { status: 'held' }, _sum: { amountNet: true } }),
  ]);
  return NextResponse.json({
    users, trainers, trainings, trainingsLive, activeRegistrations: regs,
    paidSales: payments.length,
    grossNgn: payments.reduce((a, p) => a + p.amountNgn, 0),
    commissionNgn: payments.reduce((a, p) => a + p.commissionNgn, 0),
    certsValid, certsRevoked, postsLive, postsHidden, reportsOpen,
    payoutsHeldNgn: payoutsHeld._sum.amountNet || 0,
  });
}
