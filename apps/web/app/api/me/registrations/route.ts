import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/me/registrations — my active registrations with training + sessions
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Both kinds matter: an active row means a joinable seat; pending_payment means
  // a held seat that the UI must pay for before join becomes possible.
  const regs = await prisma.registration.findMany({
    where: { userId, status: { in: ['active', 'pending_payment'] } },
    include: {
      training: { include: { sessions: { orderBy: { startsAtUtc: 'asc' } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  // Find the matching pending payment so the UI can offer a working Pay button
  // and a real reference instead of having to start checkout from scratch.
  const pendingRefs = regs.filter((r) => r.status === 'pending_payment').map((r) => r.pendingPaymentRef).filter(Boolean) as string[];
  const pendingPayments = pendingRefs.length
    ? await prisma.payment.findMany({ where: { providerRef: { in: pendingRefs }, status: 'pending' }, select: { providerRef: true, amountNgn: true } })
    : [];
  const payByRef = new Map(pendingPayments.map((p) => [p.providerRef, p.amountNgn]));
  return NextResponse.json({
    registrations: regs.map((r) => ({
      id: r.id,
      status: r.status,
      certPaid: r.certPaid,
      quotedPricePerDayNgn: r.quotedPricePerDayNgn,
      quotedDays: r.quotedDays,
      quotedTotalNgn: r.quotedTotalNgn,
      pendingPaymentRef: r.pendingPaymentRef,
      pendingPaymentAmountNgn: r.pendingPaymentRef ? (payByRef.get(r.pendingPaymentRef) ?? null) : null,
      accessType: r.training.accessType,
      training: r.training,
    })),
  });
}
