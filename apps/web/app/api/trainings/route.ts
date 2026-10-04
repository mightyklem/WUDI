import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { makeSlug, validateTrainingInput } from '@/lib/trainings';

export const dynamic = 'force-dynamic';

async function trainerId(req: Request): Promise<string | null> {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return null;
  const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
  return profile ? userId : null;
}

// GET /api/trainings?status=live — list (capped 50)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const trainings = await prisma.training.findMany({
    where: status ? { status } : undefined,
    take: 50,
    orderBy: { createdAt: 'desc' },
    include: {
      trainer: { select: { displayName: true } },
      sessions: { orderBy: { startsAtUtc: 'asc' } },
    },
  });
  return NextResponse.json({ trainings });
}

// POST /api/trainings — create (trainer only). Body: TrainingInput.
export async function POST(req: Request) {
  const tid = await trainerId(req);
  if (!tid) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  // Phase 6 gates paid certs; for now nobody is approved.
  const v = validateTrainingInput(body, false);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const training = await prisma.training.create({
    data: {
      slug: makeSlug(v.data.title),
      trainerId: tid,
      title: v.data.title,
      description: v.data.description,
      topic: v.data.topic,
      format: v.data.format,
      certMode: v.data.certMode,
      certPriceNgn: v.data.certPriceNgn,
      minPct: v.data.minPct,
      cap: v.data.cap,
      plan: 'free',
      status: 'live',
      sessions: {
        create: v.data.sessions.map((s, i) => ({
          startsAtUtc: s.startsAtUtc,
          endsAtUtc: s.endsAtUtc,
          livekitRoom: `local-${Date.now()}-${i}`,
          status: 'scheduled',
        })),
      },
    },
    include: { sessions: true },
  });
  // Fix room names with real ids (rooms are per session id).
  for (const s of training.sessions) {
    await prisma.session.update({
      where: { id: s.id },
      data: { livekitRoom: `${training.id}-${s.id}` },
    });
  }
  return NextResponse.json({ training: { ...training, invitePath: `/t/${training.slug}/register` } }, { status: 201 });
}
