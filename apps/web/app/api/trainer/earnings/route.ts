import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { MIN_PAYOUT_NGN } from '@/lib/payout-accounts';
import { payoutBalance } from '@learnovize/shared/payout-balance';

export const dynamic = 'force-dynamic';

// GET /api/trainer/earnings — clear breakdown per training (FR-9.3, FR-9.6):
// amount paid, provider fee, Wudi commission, net due, payout status.
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  const trainings = await prisma.training.findMany({
    where: { trainerId: userId },
    include: {
      registrations: { include: { payments: true } },
      payouts: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  const rows = trainings.map((t) => {
    const paid = t.registrations.flatMap((r) => r.payments).filter((p) => p.status === 'paid');
    const gross = paid.reduce((a, p) => a + p.amountNgn, 0);
    const fees = paid.reduce((a, p) => a + p.providerFeeNgn, 0);
    const commission = paid.reduce((a, p) => a + p.commissionNgn, 0);
    const net = paid.reduce((a, p) => a + p.netNgn, 0);
    return {
      trainingId: t.id, title: t.title, plan: t.plan,
      sales: paid.length, gross, providerFees: fees, commission, net,
      payouts: t.payouts.map((p) => ({ id: p.id, amountNet: p.amountNet, status: p.status, holdUntil: p.holdUntil })),
    };
  });
  const totals = rows.reduce(
    (a, r) => ({ gross: a.gross + r.gross, fees: a.fees + r.providerFees, commission: a.commission + r.commission, net: a.net + r.net }),
    { gross: 0, fees: 0, commission: 0, net: 0 },
  );

  // The balance: everything earned across every class, added up, and how much more
  // has to arrive before it is released. A trainer earning a little at a time should
  // be able to see that the little is being kept, not lost.
  const pending = await prisma.payout.findMany({
    where: { trainerId: userId, status: { in: ['held', 'failed'] } },
    select: { amountNet: true, holdUntil: true },
  });
  const balance = payoutBalance(pending, { minNgn: MIN_PAYOUT_NGN });

  return NextResponse.json({ plan: profile.plan, rows, totals, balance, minPayoutNgn: MIN_PAYOUT_NGN });
}
