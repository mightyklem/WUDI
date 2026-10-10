import { NextResponse } from 'next/server';
import { Prisma } from '../../../../../generated/prisma';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { emailEnabled, seatConfirmedEmail, sendEmail } from '@/lib/email';
import { quoteFor } from '@/lib/pricing';

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
// On a paid class the participant reserves the seat first, then pays via
// /checkout. The quote is snapshotted here so a later price change cannot
// alter what this participant owes (FR-11).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { certConsentPublic = false, dayIds = [] } = (await req.json().catch(() => ({}))) as {
    certConsentPublic?: boolean;
    dayIds?: string[];
  };

  const t = await prisma.training.findUnique({
    where: { id },
    include: {
      sessions: { select: { startsAtUtc: true } },
      days: { orderBy: { dayIndex: 'asc' } },
    },
  });
  if (!t || (t.status !== 'live' && t.status !== 'full')) {
    return NextResponse.json({ error: 'Training not open' }, { status: 404 });
  }
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.suspended) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // The learner picks which days they will attend (FR-11). They must choose at
  // least one, and the quote is the sum of just those days.
  const validDayIds = new Set(t.days.map((d) => d.id));
  const requested = Array.isArray(dayIds) ? dayIds.filter((d): d is string => typeof d === 'string') : [];
  const picked = requested.filter((d) => validDayIds.has(d));
  if (requested.length !== picked.length) {
    return NextResponse.json({ error: 'Unknown day selected' }, { status: 400 });
  }
  if (!picked.length) {
    return NextResponse.json({ error: 'Choose at least one day to attend' }, { status: 400 });
  }

  const chosenDays = t.days.filter((d) => picked.includes(d.id));
  const earliestSessionStart = t.sessions.length
    ? Math.min(...t.sessions.map((s) => new Date(s.startsAtUtc).getTime()))
    : undefined;
  const price = {
    days: chosenDays.length,
    pricePerDayNgn: chosenDays.length ? chosenDays[0].priceNgn : null,
    totalNgn: chosenDays.reduce((sum, d) => sum + d.priceNgn, 0),
    lines: chosenDays.map((d) => ({ id: d.id, label: `Day ${d.dayIndex}`, topic: d.topic, accessType: d.accessType, priceNgn: d.priceNgn })),
  };
  // A trainer may open some days of a paid class for free. That used to be refused
  // outright -- "A certified class needs all paid days" -- so a learner picking a free
  // preview day alongside paid ones could not register at all. That is not a rule worth
  // enforcing: free days cost nothing, and refusing the seat teaches nobody anything.
  // The learner now registers for whichever days they chose and pays for exactly those;
  // certificate eligibility already depends on payment, not on the day mix.
  const freeDays = chosenDays.filter((d) => d.accessType !== 'paid');
  const hasFreeDay = freeDays.length > 0;

  try {
    const reg = await prisma.$transaction(async (tx) => {
      const dup = await tx.registration.findUnique({
        where: { trainingId_userId: { trainingId: id, userId } },
      });
      if (dup && dup.status === 'active') {
        // They may change which days they attend, but only while nothing is
        // locked in: no session has started and no money has been taken.
        if (dup.certPaid) {
          throw Object.assign(new Error('Already registered and paid'), { code: 'DUP' });
        }
        const firstStart = earliestSessionStart ?? Infinity;
        if (Number.isFinite(firstStart) && firstStart <= Date.now()) {
          throw Object.assign(new Error('Already registered — the class has started'), { code: 'DUP' });
        }
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
      const quoteFields = {
        quotedPricePerDayNgn: price.pricePerDayNgn,
        quotedDays: price.days,
        quotedTotalNgn: price.totalNgn,
      };
      const registration = dup
        ? await tx.registration.update({
            where: { id: dup.id },
            data: { status: 'active', certPaid: false, ...quoteFields },
          })
        : await tx.registration.create({
            data: {
              trainingId: id, userId, certConsentPublic: !!certConsentPublic,
              status: 'active', ...quoteFields,
            },
          });
      // Replace the day choice rather than merging, so switching days is exact.
      await tx.dayEnrollment.deleteMany({ where: { registrationId: registration.id } });
      await tx.dayEnrollment.createMany({
        data: chosenDays.map((d) => ({
          registrationId: registration.id, dayId: d.id, priceNgn: d.priceNgn,
        })),
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
    return NextResponse.json(
      {
        registration: { id: reg.id, trainingId: id },
        // The UI needs to know whether to send them straight to payment.
        requiresPayment: t.accessType === 'paid',
        price,
        // So the learner is told plainly what a free day means rather than finding out at
        // certificate time: the seat is theirs, but this day does not count towards a
        // paid certificate.
        hasFreeDay,
        freeDayNote: hasFreeDay
          ? `Day${freeDays.length === 1 ? '' : 's'} ${freeDays.map((d) => d.dayIndex).join(', ')} ${freeDays.length === 1 ? 'is' : 'are'} free — you can attend, but free days do not count towards a paid certificate.`
          : null,
      },
      { status: 201 },
    );
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
