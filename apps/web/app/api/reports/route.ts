import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// POST /api/reports { targetType: post|trainer, targetId, reason } — report content (FR-10.7).
// Auto-flags bubble in the admin queue (Phase 8); the reporter is always acknowledged.
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { targetType, targetId, reason } = (await req.json().catch(() => ({}))) as {
    targetType?: string; targetId?: string; reason?: string;
  };
  if ((targetType !== 'post' && targetType !== 'trainer') || !targetId) {
    return NextResponse.json({ error: 'targetType post|trainer + targetId required' }, { status: 400 });
  }
  const report = await prisma.report.create({
    data: { targetType, targetId, reporterId: userId, reason: (reason || '').slice(0, 500), status: 'open' },
  });
  if (targetType === 'post') {
    await prisma.feedPost.updateMany({
      where: { id: targetId },
      data: { reportsCount: { increment: 1 } },
    });
  }
  await notify({
    userIds: [userId], type: 'report-received',
    payload: { targetType, targetId },
    email: null,
  });
  return NextResponse.json({ report }, { status: 201 });
}
