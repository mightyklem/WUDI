import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { initCheckout, newReference, provider, providerIssue, resumeUrl } from '@/lib/payments';
import { reconcilePendingPayments } from '@/lib/reconcile';
import { quoteFor } from '@/lib/pricing';

// Build the Paystack URL the user needs to complete payment. The `init` call
// is the only place we trust to talk to Paystack, and a resumed checkout is a
// straight URL with the same access code.
function checkoutUrl(init: { payUrl: string | null; accessCode?: string | null }, accessCode: string | null): string | null {
  if (init.payUrl) return init.payUrl;
  if (accessCode) return resumeUrl(accessCode);
  return null;
}

export const dynamic = 'force-dynamic';

// POST /api/registrations/[id]/checkout — pay for a PAID class (FR-11).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const issue = providerIssue();
  if (issue) {
    console.error('[registrations/checkout] payments provider misconfigured:', issue);
    return NextResponse.json(
      { error: 'Payments are not configured on this deployment.', detail: 'Nothing was charged.' },
      { status: 503 },
    );
  }
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
  // A registration can checkout from two states: pending_payment (seat held, money not in)
  // and on rare paths also active+unpaid if the webhook never landed. active+paid has nothing
  // to charge. cancelled has nothing to charge. Anything else is not yours.
  if (!reg || reg.userId !== userId) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
  }
  if (reg.status === 'cancelled') {
    return NextResponse.json({ error: 'This registration was cancelled.' }, { status: 409 });
  }
  if (reg.status === 'active' && reg.certPaid) {
    return NextResponse.json({ error: 'Already paid', paid: true }, { status: 200 });
  }
  if (reg.training.accessType !== 'paid') {
    return NextResponse.json({ error: 'This class is free — nothing to pay' }, { status: 409 });
  }

  const live = quoteFor(reg.training);
  const amountNgn = reg.quotedTotalNgn ?? live.totalNgn;
  const pricePerDayNgn = reg.quotedPricePerDayNgn ?? live.pricePerDayNgn;
  const days = reg.quotedDays ?? live.days;

  if (!amountNgn || amountNgn <= 0) {
    return NextResponse.json({ error: 'Price is not set for this class yet' }, { status: 409 });
  }
  const lastEnd = reg.training.sessions.length
    ? reg.training.sessions[reg.training.sessions.length - 1].endsAtUtc
    : null;
  if (lastEnd && lastEnd.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Sales closed — the training has ended' }, { status: 409 });
  }
  // Re-use an existing PENDING payment first so an abandoned Paystack tab is the same
  // checkout -- a fresh reference would be a new charge.
  const existing = await prisma.payment.findFirst({
    where: { registrationId: id, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    const recon = await reconcilePendingPayments({ paymentId: existing.id });
    if (recon.settled) {
      return NextResponse.json({ reference: existing.providerRef, payUrl: null, paid: true });
    }
    const stillPending = await prisma.payment.findUnique({ where: { id: existing.id } });
    if (stillPending?.status === 'pending') {
      const url = checkoutUrl({ payUrl: null }, stillPending.accessCode);
      if (url) {
        return NextResponse.json({
          reference: existing.providerRef,
          payUrl: url,
          resumed: true,
        });
      }
      // No URL, no access code: Paystack initially returned a checkout but
      // the access code is gone (couldn't be stored, or token expired). Fall
      // through and create a new one.
    }
  }
  const reference = newReference();
  let init;
  try {
    init = await initCheckout({
      email: reg.user.email, amountNgn, reference,
    });
  } catch (e) {
    // Paystack rejected or our secrets are wrong: surface what we know, leave the
    // registration in pending_payment so the user can try from /me/seats again.
    const msg = e instanceof Error ? e.message : 'Paystack init failed';
    console.error('[registrations/checkout] initCheckout threw:', msg);
    return NextResponse.json(
      { error: `Paystack rejected the checkout: ${msg}`, reference, payUrl: null },
      { status: 502 },
    );
  }
  if (!init.payUrl) {
    return NextResponse.json(
      {
        error: 'Paystack returned no checkout URL — try again from your seats page.',
        reference, payUrl: null,
      },
      { status: 502 },
    );
  }
  await prisma.$transaction([
    prisma.payment.create({
      data: {
        registrationId: id, provider: provider(), providerRef: reference,
        accessCode: init.accessCode,
        amountNgn,
        providerFeeNgn: 0, commissionNgn: 0, netNgn: 0,
        status: 'pending', idempotencyKey: reference,
      },
    }),
    prisma.registration.update({
      where: { id },
      data: { pendingPaymentRef: reference },
    }),
  ]);
  return NextResponse.json(
    { reference: init.reference, payUrl: init.payUrl, amountNgn, pricePerDayNgn, days },
    { status: 201 },
  );
}
