import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { refundPaystack } from '@/lib/payments';

export const dynamic = 'force-dynamic';

// POST /api/payments/[id]/refund { reason }
// FR-9.5: full refund when the trainer cancels, or the participant cancels ≥24h
// before the first session. Provider-fee absorption follows the locked Phase-0 rule:
// trainer-cancel → Wudi absorbs (participant gets full amount); participant-cancel →
// provider fee is forfeited from the refund. Unsets certPaid and shrinks held payouts.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      registration: { include: { training: { include: { sessions: { orderBy: { startsAtUtc: 'asc' }, take: 1 } } } } },
    },
  });
  if (!payment || payment.status !== 'paid') {
    return NextResponse.json({ error: 'Paid payment not found' }, { status: 404 });
  }
  const reg = payment.registration;
  const training = reg.training;
  const isTrainer = training.trainerId === userId;
  const isOwner = reg.userId === userId;
  if (!isTrainer && !isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const firstStart = training.sessions[0]?.startsAtUtc.getTime() ?? 0;
  const hoursLeft = (firstStart - Date.now()) / 3600000;
  let ok = false;
  let refundNgn = 0;
  if (isTrainer || training.status === 'cancelled') {
    ok = true; // trainer cancelled (or no-show): full amount back, Wudi absorbs fees
    refundNgn = payment.amountNgn;
  } else if (hoursLeft >= 24) {
    ok = true; // participant early cancel: amount minus provider fee
    refundNgn = payment.amountNgn - payment.providerFeeNgn;
  }
  if (!ok) {
    return NextResponse.json({ error: 'No refund: inside 24h window and training holds' }, { status: 409 });
  }

  // Move the money FIRST. The previous version marked the payment refunded in the
  // database without ever calling Paystack, so a participant could be told their money
  // was returned when it never left. If this fails we say so and change nothing.
  const result = await refundPaystack(payment.providerRef, refundNgn);
  if (!result.ok) {
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'payment.refund.failed',
        target: `payment:${payment.providerRef}`,
        reason: result.message.slice(0, 300),
      },
    });
    return NextResponse.json(
      { error: `Refund could not be completed: ${result.message}` },
      { status: 502 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { status: 'refunded' } });
    await tx.registration.update({ where: { id: reg.id }, data: { certPaid: false } });
    const held = await tx.payout.findFirst({
      where: { trainerId: training.trainerId, trainingId: training.id, status: { in: ['pending', 'held'] } },
    });
    if (held) {
      const next = Math.max(0, held.amountNet - payment.netNgn);
      await tx.payout.update({ where: { id: held.id }, data: { amountNet: next } });
    }
    await tx.auditLog.create({
      data: { actorId: userId, action: 'payment.refund', target: `payment:${payment.providerRef}`, reason: (reason || '').slice(0, 300) || null },
    });
    await tx.notification.create({
      data: { userId: reg.userId, type: 'payment-refunded', payload: { trainingId: training.id, refundNgn } },
    });
  });
  return NextResponse.json({ ok: true, refundNgn, refundId: result.refundId });
}
