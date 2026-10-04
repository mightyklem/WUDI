import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/trainers/[id]/follow — follow a trainer (FR-1.4). id = trainer userId.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: trainerId } = await params;
  if (trainerId === userId) {
    return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 });
  }
  const trainer = await prisma.trainerProfile.findUnique({ where: { userId: trainerId } });
  if (!trainer) return NextResponse.json({ error: 'Trainer not found' }, { status: 404 });
  await prisma.follow.upsert({
    where: { followerId_trainerId: { followerId: userId, trainerId } },
    create: { followerId: userId, trainerId },
    update: {},
  });
  return NextResponse.json({ following: true });
}

// DELETE /api/trainers/[id]/follow — unfollow
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: trainerId } = await params;
  await prisma.follow.deleteMany({ where: { followerId: userId, trainerId } });
  return NextResponse.json({ following: false });
}
