import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/due — seats this person owes money for.
 *
 * Exists because a learner who abandoned checkout had no way to see they still owed
 * anything. The registration page had a Pay button, but nothing surfaced it, so the debt
 * was invisible until they happened to go looking.
 *
 * Deliberately read-only. This must never be able to settle anything -- the banner's
 * "I have paid" button checks with Paystack through /api/payments/reconcile instead. An
 * endpoint that could mark a payment settled on request would be the same free-registration
 * hole the mock provider was.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const registrations = await prisma.registration.findMany({
    where: {
      userId,
      status: 'active',
      certPaid: false,
      training: { accessType: 'paid', status: { in: ['live', 'full'] } },
      payments: { some: { status: 'pending' } },
    },
    select: {
      id: true,
      quotedTotalNgn: true,
      training: {
        select: {
          title: true,
          slug: true,
          pricePerDayNgn: true,
          accessType: true,
          sessions: { orderBy: { startsAtUtc: 'asc' }, take: 1, select: { startsAtUtc: true } },
        },
      },
      payments: {
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, providerRef: true, amountNgn: true, createdAt: true },
      },
    },
  });

  const now = Date.now();
  const due = registrations
    .map((r) => {
      const payment = r.payments[0];
      const firstSession = r.training.sessions[0]?.startsAtUtc.getTime() ?? null;
      // A class that has already run is not a debt anyone can act on, so it is not shown.
      const expired = firstSession !== null && firstSession < now;
      // The pending payment's amount, not the registration quote. The quote is a snapshot
      // taken at registration; the payment is what Paystack is actually going to charge.
      // When those disagree -- a price changed mid-checkout -- the learner must be told the
      // real figure, not a stale one they will be surprised by on the payment page.
      const amountNgn = payment?.amountNgn ?? r.quotedTotalNgn ?? r.training.pricePerDayNgn ?? 0;
      return {
        registrationId: r.id,
        title: r.training.title,
        slug: r.training.slug,
        amountNgn,
        paymentId: payment?.id ?? null,
        reference: payment?.providerRef ?? null,
        // Long enough for a bank transfer to clear, short enough that an abandoned
        // reference does not sit in someone's face for months.
        expiresInHours: payment ? Math.max(0, Math.round((payment.createdAt.getTime() + 7 * 24 * 3600 * 1000 - now) / 3600000)) : null,
        expired,
      };
    })
    .filter((d) => d.paymentId && !d.expired && d.amountNgn > 0);

  return NextResponse.json({ due });
}