import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// POST /api/admin/payouts/release — pay out held funds whose hold period passed (FR-9.4).
// (A scheduler calls this in production; manual trigger suffices for Phase 6.)
export async function POST(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const due = await prisma.payout.findMany({
    where: { status: 'held', holdUntil: { lte: new Date() } },
  });
  for (const p of due) {
    // Real transfer happens here (Paystack Transfers) once live keys exist.
    await prisma.payout.update({ where: { id: p.id }, data: { status: 'paid' } });
    await prisma.notification.create({
      data: { userId: p.trainerId, type: 'payout-paid', payload: { trainingId: p.trainingId, amountNet: p.amountNet } },
    });
  }
  await prisma.auditLog.create({
    data: { actorId, action: 'payout.release', target: `count:${due.length}`, reason: null },
  });
  return NextResponse.json({ released: due.map((p) => ({ id: p.id, amountNet: p.amountNet })) });
}
