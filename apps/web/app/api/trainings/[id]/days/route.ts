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
// A day that has already been delivered, or priced after anyone registered, is
// locked: changing it would either rewrite history or alter what people owe.
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

  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 80) : day.topic;
  const accessType = body.accessType ?? day.accessType;

  // Free/paid and price are both money decisions.
  const pricingChanged =
    accessType !== day.accessType ||
    (accessType === 'paid' && Number(body.priceNgn ?? day.priceNgn) !== day.priceNgn);

  if (pricingChanged) {
    // Anything already delivered cannot be repriced after the fact.
    const delivered = day.sessions.some((s) => new Date(s.startsAtUtc).getTime() <= Date.now());
    if (delivered) {
      return NextResponse.json(
        { error: 'This day has already started — its price can no longer change' },
        { status: 409 },
      );
    }
    const activeRegs = await prisma.registration.count({
      where: { trainingId: id, status: 'active' },
    });
    if (activeRegs > 0) {
      return NextResponse.json(
        { error: 'Price and free/paid are locked once participants have registered' },
        { status: 409 },
      );
    }
  }

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