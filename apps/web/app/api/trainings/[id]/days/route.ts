import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { validateDayPricing } from '@/lib/days';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function ownerOrMod(req: Request, id: string) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return null;
  const t = await prisma.training.findUnique({ where: { id } });
  if (!t) return null;
  if (t.trainerId === userId) return { training: t, as: 'trainer' as const };
  const mod = await prisma.moderator.findUnique({
    where: { trainingId_userId: { trainingId: id, userId } },
  });
  if (mod && mod.status === 'active') return { training: t, as: 'moderator' as const };
  return null;
}

// GET /api/trainings/[id]/days — the billable days with their sessions.
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const days = await prisma.trainingDay.findMany({
    where: { trainingId: id },
    orderBy: { dayIndex: 'asc' },
    include: {
      sessions: { orderBy: { startsAtUtc: 'asc' }, select: { id: true, startsAtUtc: true, endsAtUtc: true, status: true } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!days.length) return NextResponse.json({ days: [] });
  return NextResponse.json({ days });
}

// PATCH /api/trainings/[id]/days — change one day's topic, price, or free/paid.
//
// Once anyone has bought a day, that day is frozen: its topic, its price and its
// free/paid status. The topic is not merely a label — it is part of what the
// learner selected and paid for, and it is what their certificate will name.
// Renaming it afterwards would hand them a different day than the one they
// agreed to buy.
//
// The lock is per day, not per training. A day nobody has enrolled in can still
// be renamed or priced after the class has sold other days.
//
// A day that has already been delivered can never change, even with no
// enrolments, because the attendance record already refers to it.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await ownerOrMod(req, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ctx.training.status === 'cancelled' || ctx.training.status === 'finished') {
    return NextResponse.json({ error: 'Training is closed' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as {
    dayId?: string; topic?: string; accessType?: string; priceNgn?: number | null;
  };
  if (!body.dayId) return NextResponse.json({ error: 'dayId is required' }, { status: 400 });

  const day = await prisma.trainingDay.findFirst({
    where: { id: body.dayId, trainingId: id },
    include: { sessions: { select: { startsAtUtc: true } } },
  });
  if (!day) return NextResponse.json({ error: 'Day not found' }, { status: 404 });

  // Sold, or already taught: this day can no longer change in any respect.
  const sold = await prisma.dayEnrollment.count({
    where: { dayId: day.id, registration: { status: 'active' } },
  });
  const delivered = day.sessions.some((s) => new Date(s.startsAtUtc).getTime() <= Date.now());
  if (sold > 0 || delivered) {
    const why = delivered
      ? 'This day has already started — it can no longer be changed'
      : `This day has already been bought by ${sold} learner${sold === 1 ? '' : 's'} — topic and price are locked`;
    return NextResponse.json({ error: why, locked: true }, { status: 409 });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 80) : day.topic;
  const accessType = body.accessType ?? day.accessType;

  const v = validateDayPricing({
    tier: ctx.training.tier,
    accessType,
    // Reuse the stored price when only the topic is changing.
    priceNgn: accessType === 'paid' ? (body.priceNgn ?? day.priceNgn) : null,
  });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const updated = await prisma.trainingDay.update({
    where: { id: day.id },
    data: { topic: topic || null, accessType: v.accessType, priceNgn: v.priceNgn },
  });
  await prisma.auditLog.create({
    data: {
      actorId: (await requireActor(req)) as string,
      action: 'training-day.updated',
      target: `training:${id}/day:${day.id}`,
      reason: `${v.accessType} @ ${v.priceNgn}`,
    },
  });
  return NextResponse.json({ day: updated });
}

async function requireActor(req: Request) {
  const token = getBearer(req);
  return token ? await verifyAccessToken(token) : null;
}