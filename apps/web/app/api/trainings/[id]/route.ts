import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { validateTrainingInput } from '@/lib/trainings';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function owner(req: Request, id: string) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return null;
  const t = await prisma.training.findUnique({ where: { id } });
  if (!t || t.trainerId !== userId) return null;
  return t;
}

// GET /api/trainings/[id] — detail with sessions + seats left
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const t = await prisma.training.findUnique({
    where: { id },
    include: {
      trainer: { select: { displayName: true } },
      sessions: { orderBy: { startsAtUtc: 'asc' } },
    },
  });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ training: { ...t, seatsLeft: t.cap - t.seatsTaken } });
}

// PATCH /api/trainings/[id] — edit/reschedule (owner). Notifies registrants.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const t = await owner(req, id);
  if (!t) return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 });
  if (t.status === 'cancelled' || t.status === 'finished') {
    return NextResponse.json({ error: 'Training is closed' }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const profile = await prisma.trainerProfile.findUnique({ where: { userId: t.trainerId } });
  const v = validateTrainingInput(
    { title: body.title ?? t.title, description: body.description ?? t.description,
      topic: body.topic ?? t.topic, format: body.format ?? t.format,
      certMode: body.certMode ?? t.certMode, certPriceNgn: body.certPriceNgn ?? t.certPriceNgn,
      minPct: body.minPct ?? t.minPct, cap: body.cap ?? t.cap,
      sessions: body.sessions ?? (await prisma.session.findMany({ where: { trainingId: id } }))
        .map((s) => ({ startsAtUtc: s.startsAtUtc.toISOString(), endsAtUtc: s.endsAtUtc.toISOString() })) },
    profile?.paidCertApproved === true,
  );
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (v.data.cap < t.seatsTaken) {
    return NextResponse.json({ error: `Cap cannot go below ${t.seatsTaken} taken seats` }, { status: 409 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.training.update({
      where: { id },
      data: {
        title: v.data.title, description: v.data.description, topic: v.data.topic,
        format: v.data.format, minPct: v.data.minPct, cap: v.data.cap,
        status: v.data.cap <= t.seatsTaken ? 'full' : t.status === 'full' ? 'live' : t.status,
      },
    });
    if (body.sessions) {
      await tx.session.deleteMany({ where: { trainingId: id } });
      for (const [i, s] of v.data.sessions.entries()) {
        await tx.session.create({
          data: { trainingId: id, startsAtUtc: s.startsAtUtc, endsAtUtc: s.endsAtUtc,
            livekitRoom: `${id}-resched-${Date.now()}-${i}`, status: 'scheduled' },
        });
      }
    }
    const regs = await tx.registration.findMany({
      where: { trainingId: id, status: 'active' }, select: { userId: true },
    });
    if (regs.length) {
      await tx.notification.createMany({
        data: regs.map((r) => ({
          userId: r.userId, type: 'training-updated',
          payload: { trainingId: id, title: v.data.title },
        })),
      });
    }
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/trainings/[id] — cancel (owner). Notifies + full refunds handled in Phase 6.
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const t = await owner(req, id);
  if (!t) return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.training.update({ where: { id }, data: { status: 'cancelled' } });
    const regs = await tx.registration.findMany({
      where: { trainingId: id, status: 'active' }, select: { userId: true },
    });
    if (regs.length) {
      await tx.notification.createMany({
        data: regs.map((r) => ({
          userId: r.userId, type: 'training-cancelled',
          payload: { trainingId: id, title: t.title },
        })),
      });
    }
  });
  return NextResponse.json({ ok: true });
}
