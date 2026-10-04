import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/trainings/[id]/save — toggle save (FR-10.4)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const training = await prisma.training.findUnique({ where: { id } });
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const existing = await prisma.save.findUnique({
    where: { userId_trainingId: { userId, trainingId: id } },
  });
  if (existing) {
    await prisma.save.delete({ where: { userId_trainingId: { userId, trainingId: id } } });
    return NextResponse.json({ saved: false });
  }
  await prisma.save.create({ data: { userId, trainingId: id } });
  return NextResponse.json({ saved: true }, { status: 201 });
}
