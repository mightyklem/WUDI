import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { initCheckout, newReference, provider } from '@/lib/payments';
import { VERIFICATION_FEE_NGN, canPurchaseBadge } from '@/lib/verification';
import { VERIFICATION_PREFIX } from '@/lib/verification-settle';

export const dynamic = 'force-dynamic';

/**
 * POST /api/trainer/verification/checkout — buy the right to be reviewed.
 *
 * This charges money and grants nothing. The badge is issued by a reviewer, not by a
 * successful charge; see lib/verification.ts for why the two are kept apart.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.trainerProfile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  if (provider() !== 'paystack') {
    return NextResponse.json({ error: 'Verification is only available on Paystack' }, { status: 404 });
  }

  const app = await prisma.trainerApplication.findUnique({ where: { trainerId: userId } });
  const gate = canPurchaseBadge(app);
  if (!gate.ok) {
    return NextResponse.json({ error: 'Verification already purchased for this application' }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return NextResponse.json({ error: 'No email on file' }, { status: 400 });

  // A rejected applicant retrying gets a fresh reference; the old one is dead and its
  // refund is tracked separately so the two cannot be confused.
  const reference = newReference(VERIFICATION_PREFIX);
  const created = app
    ? await prisma.trainerApplication.update({
        where: { id: app.id },
        data: { paymentRef: reference, refundedAt: null, refundPending: false },
      })
    : await prisma.trainerApplication.create({
        data: { trainerId: userId, answers: {}, paymentRef: reference },
      });

  const result = await initCheckout({
    email: user.email,
    amountNgn: VERIFICATION_FEE_NGN,
    reference,
  });

  if (!result.payUrl) {
    // Nothing was charged, so release the reference rather than leaving the
    // application looking paid-but-unpaid.
    await prisma.trainerApplication.update({ where: { id: created.id }, data: { paymentRef: null } });
    return NextResponse.json({ error: 'Paystack did not return a checkout link' }, { status: 502 });
  }

  return NextResponse.json({
    url: result.payUrl,
    reference,
    amountNgn: VERIFICATION_FEE_NGN,
  });
}