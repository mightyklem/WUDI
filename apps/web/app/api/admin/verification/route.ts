import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { badgeState } from '@/lib/verification';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/verification?status=submitted|in_review|all
 *
 * The review queue. Sorted oldest-first because a verification fee is being held while
 * an application sits here, so delay has a running cost.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = new URL(req.url).searchParams.get('status') || 'submitted';
  const where = status === 'all' ? {} : { status };

  const queue = await prisma.trainerApplication.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      trainer: { select: { displayName: true, user: { select: { email: true } } } },
    },
  });

  return NextResponse.json({
    queue: queue.map((a) => ({
      id: a.id,
      trainerId: a.trainerId,
      name: a.trainer.displayName,
      email: a.trainer.user.email,
      status: a.status,
      formSubtotal: a.formSubtotal,
      proofGrade: a.proofGrade,
      finalRating: a.finalRating,
      band: a.band,
      paidAt: a.paidAt,
      amountPaidNgn: a.amountPaidNgn,
      refundPending: a.refundPending,
      badge: badgeState(a),
      createdAt: a.createdAt,
    })),
  });
}