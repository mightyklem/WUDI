import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function ownerTraining(req: Request, trainingId: string) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return null;
  const t = await prisma.training.findUnique({ where: { id: trainingId } });
  return t && t.trainerId === userId ? t : null;
}

// POST /api/trainings/[id]/moderators { email } — trainer invites a moderator (FR-3.7).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await ownerTraining(req, id);
  if (!t) return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return NextResponse.json({ error: 'No Learnovize account with that email' }, { status: 404 });
  if (user.id === t.trainerId) return NextResponse.json({ error: 'Trainer is already in charge' }, { status: 400 });
  const mod = await prisma.moderator.upsert({
    where: { trainingId_userId: { trainingId: id, userId: user.id } },
    create: { trainingId: id, userId: user.id, status: 'invited' },
    update: { status: 'invited' },
  });
  await prisma.notification.create({
    data: { userId: user.id, type: 'moderator-invited', payload: { trainingId: id, title: t.title } },
  });
  return NextResponse.json({ moderator: mod }, { status: 201 });
}

// GET /api/trainings/[id]/moderators — roster (owner sees all, others see actives)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mods = await prisma.moderator.findMany({
    where: { trainingId: id },
    include: { user: { select: { email: true } } },
  });
  return NextResponse.json({ moderators: mods });
}
