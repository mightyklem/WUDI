import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/registrations/[id]/cancel — frees the seat if training hasn't started.
// Refund note: free trainings in Phase 2 have nothing to refund (paid rules land in Phase 6).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const reg = await prisma.registration.findUnique({
    where: { id },
    include: { training: { include: { sessions: { orderBy: { startsAtUtc: 'asc' }, take: 1 } } } },
  });
  // pending_payment seats are held. Cancelling them returns the seat like an
  // active cancelled row would; active + paid runs through existing refund rules.
  if (!reg || reg.userId !== userId || (reg.status !== 'active' && reg.status !== 'pending_payment')) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
  }
  if (reg.status === 'active' && reg.certPaid) {
    return NextResponse.json(
      { error: 'This registration has been paid for — cancel goes through refund, which lives in /me/registrations.' },
      { status: 409 },
    );
  }
  const firstStart = reg.training.sessions[0]?.startsAtUtc;
  if (firstStart && firstStart.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Training has started — seat cannot be freed' }, { status: 409 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.registration.update({ where: { id }, data: { status: 'cancelled' } });
    // Drop the pending payment row too if there is one, so a re-register does not
    // accidentally resume a checkout for a seat that is no longer held.
    await tx.payment.updateMany({ where: { registrationId: id, status: 'pending' }, data: { status: 'failed' } });
    await tx.training.updateMany({
      where: { id: reg.trainingId, seatsTaken: { gt: 0 } },
      data: { seatsTaken: { decrement: 1 }, status: 'live' },
    });
    // No self-notification: the person just pressed cancel and watched it
    // happen. A row telling them what they did is noise, not information.
  });
  return NextResponse.json({ ok: true });
}
