import { prisma } from '@/lib/db';
import { splitPayment, payoutHoldDays } from '@/lib/payments';

/**
 * Settle a paid cert payment (shared by mock completion + Paystack webhook).
 * Idempotent on providerRef: already-paid payments are returned untouched.
 * Creates/extends the trainer's HELD payout for the training (released after the hold period).
 */
export async function settlePaidPayment(opts: {
  providerRef: string;
  amountNgn: number;
  providerFeeNgn: number;
}) {
  const payment = await prisma.payment.findUnique({
    where: { providerRef: opts.providerRef },
    include: {
      registration: {
        include: {
          training: { include: { trainer: true, sessions: { orderBy: { startsAtUtc: 'desc' }, take: 1 } } },
        },
      },
    },
  });
  if (!payment) throw Object.assign(new Error('Payment not found'), { code: 'UNKNOWN_REF' });
  if (payment.status === 'paid') return payment; // idempotent replay
  if (payment.status !== 'pending') {
    throw Object.assign(new Error(`Payment is ${payment.status}`), { code: 'BAD_STATE' });
  }
  if (opts.amountNgn < payment.amountNgn) {
    throw Object.assign(new Error('Underpaid'), { code: 'UNDERPAID' });
  }

  const plan = payment.registration.training.trainer.plan;
  const split = splitPayment(payment.amountNgn, opts.providerFeeNgn, plan);
  const lastEnd = payment.registration.training.sessions[0]?.endsAtUtc ?? new Date();
  const holdUntil = new Date(lastEnd.getTime() + payoutHoldDays() * 24 * 3600 * 1000);

  return prisma.$transaction(async (tx) => {
    const paid = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'paid',
        providerFeeNgn: split.providerFeeNgn,
        commissionNgn: split.commissionNgn,
        netNgn: split.netNgn,
      },
    });
    await tx.registration.update({
      where: { id: payment.registrationId },
      data: { certPaid: true },
    });
    // One held payout per trainer+training; top it up as sales land.
    const existing = await tx.payout.findFirst({
      where: {
        trainerId: payment.registration.training.trainerId,
        trainingId: payment.registration.trainingId,
        status: { in: ['pending', 'held'] },
      },
    });
    if (existing) {
      await tx.payout.update({
        where: { id: existing.id },
        data: { amountNet: existing.amountNet + split.netNgn, status: 'held', holdUntil },
      });
    } else {
      await tx.payout.create({
        data: {
          trainerId: payment.registration.training.trainerId,
          trainingId: payment.registration.trainingId,
          amountNet: split.netNgn, status: 'held', holdUntil,
        },
      });
    }
    await tx.notification.create({
      data: {
        userId: payment.registration.userId, type: 'payment-received',
        payload: { trainingId: payment.registration.trainingId, amountNgn: payment.amountNgn },
      },
    });
    await tx.notification.create({
      data: {
        userId: payment.registration.training.trainerId, type: 'payment-received',
        payload: { trainingId: payment.registration.trainingId, amountNgn: payment.amountNgn, netNgn: split.netNgn },
      },
    });
    return paid;
  });
}
