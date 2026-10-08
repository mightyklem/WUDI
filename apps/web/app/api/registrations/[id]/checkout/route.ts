import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { initCheckout, newReference, provider, resumeUrl } from '@/lib/payments';
import { reconcilePendingPayments } from '@/lib/reconcile';
import { quoteFor } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

// POST /api/registrations/[id]/checkout — pay for a PAID class (FR-11).
// On a paid class the fee covers attendance AND the certificate. The participant
// pays the quoted per-day price multiplied by the number of billable days.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const reg = await prisma.registration.findUnique({
    where: { id },
    include: {
      training: { include: { sessions: { orderBy: { startsAtUtc: 'asc' } } } },
      user: true,
    },
  });
  if (!reg || reg.userId !== userId || reg.status !== 'active') {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
  }
  if (reg.training.accessType !== 'paid') {
    return NextResponse.json({ error: 'This class is free — nothing to pay' }, { status: 409 });
  }

  // Honour the quote the participant actually registered at. If they registered
  // before the trainer locked the price, fall back to the live price.
  const live = quoteFor(reg.training);
  const amountNgn = reg.quotedTotalNgn ?? live.totalNgn;
  const pricePerDayNgn = reg.quotedPricePerDayNgn ?? live.pricePerDayNgn;
  const days = reg.quotedDays ?? live.days;

  if (!amountNgn || amountNgn <= 0) {
    return NextResponse.json({ error: 'Price is not set for this class yet' }, { status: 409 });
  }
  if (reg.certPaid) return NextResponse.json({ error: 'Already paid' }, { status: 409 });
  const lastEnd = reg.training.sessions.length
    ? reg.training.sessions[reg.training.sessions.length - 1].endsAtUtc
    : null;
  if (lastEnd && lastEnd.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Sales closed — the training has ended' }, { status: 409 });
  }
  const existing = await prisma.payment.findFirst({
    where: { registrationId: id, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    // The participant may have already paid and only lost the webhook — check before resuming.
    const recon = await reconcilePendingPayments({ paymentId: existing.id });
    if (recon.settled) {
      return NextResponse.json({ reference: existing.providerRef, payUrl: null, paid: true });
    }
    const stillPending = await prisma.payment.findUnique({ where: { id: existing.id } });
    if (stillPending?.status === 'pending') {
      // Abandoned checkout: hand back the SAME hosted transaction so they cannot double-pay.
      return NextResponse.json({
        reference: existing.providerRef,
        payUrl: resumeUrl(stillPending.accessCode),
        resumed: true,
      });
    }
  }
  const reference = newReference();
  const init = await initCheckout({
    email: reg.user.email, amountNgn, reference,
  });
  await prisma.payment.create({
    data: {
      registrationId: id, provider: provider(), providerRef: reference,
      accessCode: init.accessCode,
      amountNgn,
      providerFeeNgn: 0, commissionNgn: 0, netNgn: 0,
      status: 'pending', idempotencyKey: reference,
    },
  });
  return NextResponse.json(
    { reference: init.reference, payUrl: init.payUrl, amountNgn, pricePerDayNgn, days },
    { status: 201 },
  );
}
