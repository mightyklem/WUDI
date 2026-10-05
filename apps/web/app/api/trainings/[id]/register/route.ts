import { NextResponse } from 'next/server';
import { Prisma } from '../../../../../generated/prisma';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { emailEnabled, seatConfirmedEmail, sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

/** Seat confirmation email — best effort, never blocks or fails the claim (FR-2.4). */
async function sendSeatConfirmation(userId: string, title: string) {
  if (!emailEnabled()) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  await sendEmail({ ...seatConfirmedEmail({ trainingTitle: title, seatPath: '/me/registrations' }), to: user.email });
}

// POST /api/trainings/[id]/register { certConsentPublic? }
// Atomic: duplicate-check + conditional seat increment in one transaction.
// Full or duplicate -> 409. Free trainings only in Phase 2 (paid in Phase 6).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { certConsentPublic = false } = (await req.json().catch(() => ({}))) as {
    certConsentPublic?: boolean;
  };

  const t = await prisma.training.findUnique({ where: { id } });
  if (!t || (t.status !== 'live' && t.status !== 'full')) {
    return NextResponse.json({ error: 'Training not open' }, { status: 404 });
  }
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.suspended) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Paid certification is an add-on: register free now, buy the cert before the last session ends.
  try {
    const reg = await prisma.$transaction(async (tx) => {
      const dup = await tx.registration.findUnique({
        where: { trainingId_userId: { trainingId: id, userId } },
      });
      if (dup && dup.status === 'active') {
        throw Object.assign(new Error('Already registered'), { code: 'DUP' });
      }
      // Atomic seat claim: only increments when a seat is actually free.
      const claimed = await tx.training.updateMany({
        where: { id, seatsTaken: { lt: t.cap }, status: { in: ['live', 'full'] } },
        data: { seatsTaken: { increment: 1 } },
      });
      if (claimed.count === 0) {
        await tx.training.updateMany({ where: { id }, data: { status: 'full' } });
        throw Object.assign(new Error('Training is full'), { code: 'FULL' });
      }
      const registration = dup
        ? await tx.registration.update({ where: { id: dup.id }, data: { status: 'active', certConsentPublic: !!certConsentPublic } })
        : await tx.registration.create({
            data: { trainingId: id, userId, certConsentPublic: !!certConsentPublic, status: 'active' },
          });
      const updated = await tx.training.findUnique({ where: { id } });
      if (updated && updated.seatsTaken >= updated.cap) {
        await tx.training.update({ where: { id }, data: { status: 'full' } });
      }
      await tx.notification.create({
        data: { userId, type: 'registration-confirmed', payload: { trainingId: id, title: t.title } },
      });
      return registration;
    });
    // Outside the transaction: a slow or failed email must never roll back the seat claim.
    await sendSeatConfirmation(userId, t.title);
    return NextResponse.json({ registration: { id: reg.id, trainingId: id } }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Already registered' }, { status: 409 });
    }
    if (e instanceof Error && (e as { code?: string }).code === 'FULL') {
      return NextResponse.json({ error: 'Training is full' }, { status: 409 });
    }
    if (e instanceof Error && (e as { code?: string }).code === 'DUP') {
      return NextResponse.json({ error: 'Already registered' }, { status: 409 });
    }
    throw e;
  }
}
