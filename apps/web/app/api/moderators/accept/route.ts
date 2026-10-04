import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/moderators/accept { trainingId } — invited user accepts the role.
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { trainingId } = (await req.json().catch(() => ({}))) as { trainingId?: string };
  if (!trainingId) return NextResponse.json({ error: 'trainingId required' }, { status: 400 });
  const mod = await prisma.moderator.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
  });
  if (!mod || mod.status !== 'invited') {
    return NextResponse.json({ error: 'No pending invite' }, { status: 404 });
  }
  await prisma.moderator.update({
    where: { trainingId_userId: { trainingId, userId } },
    data: { status: 'active' },
  });
  return NextResponse.json({ ok: true });
}
