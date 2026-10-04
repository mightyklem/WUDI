import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/me/saved — my saved trainings (FR-10.4)
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const saves = await prisma.save.findMany({ where: { userId } });
  const trainings = await prisma.training.findMany({
    where: { id: { in: saves.map((s) => s.trainingId) } },
    include: { trainer: { select: { displayName: true } } },
  });
  return NextResponse.json({ saved: trainings });
}
