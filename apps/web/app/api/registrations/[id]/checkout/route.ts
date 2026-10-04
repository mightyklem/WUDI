import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { initCheckout, newReference, provider } from '@/lib/payments';

export const dynamic = 'force-dynamic';

// POST /api/registrations/[id]/checkout — buy the certificate add-on (FR-5.3, FR-9).
// Anytime after registration, before the last session ends. Attendance stays free.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const reg = await prisma.registration.findUnique({
    where: { id },
    include: { training: { include: { sessions: { orderBy: { startsAtUtc: 'desc' }, take: 1 } } }, user: true },
  });
  if (!reg || reg.userId !== userId || reg.status !== 'active') {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
  }
  if (reg.training.certMode !== 'paid' || !reg.training.certPriceNgn) {
    return NextResponse.json({ error: 'This training has no paid certificate' }, { status: 409 });
  }
  if (reg.certPaid) return NextResponse.json({ error: 'Already paid' }, { status: 409 });
  const lastEnd = reg.training.sessions[0]?.endsAtUtc;
  if (lastEnd && lastEnd.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Sales closed — the training has ended' }, { status: 409 });
  }
  const existing = await prisma.payment.findFirst({
    where: { registrationId: id, status: 'pending' },
  });
  if (existing) {
    return NextResponse.json({ reference: existing.providerRef, payUrl: null, resumed: true });
  }
  const reference = newReference();
  const init = await initCheckout({
    email: reg.user.email, amountNgn: reg.training.certPriceNgn, reference,
  });
  await prisma.payment.create({
    data: {
      registrationId: id, provider: provider(), providerRef: reference,
      amountNgn: reg.training.certPriceNgn,
      providerFeeNgn: 0, commissionNgn: 0, netNgn: 0,
      status: 'pending', idempotencyKey: reference,
    },
  });
  return NextResponse.json({ reference: init.reference, payUrl: init.payUrl }, { status: 201 });
}
