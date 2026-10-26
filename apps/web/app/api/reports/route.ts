import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { notify } from '@/lib/notify';
import { flagAlert } from '@/lib/slack';

export const dynamic = 'force-dynamic';

// POST /api/reports { targetType: post|trainer|material, targetId, reason } — report content (FR-10.7).
// Auto-flags bubble in the admin queue (Phase 8); the reporter is always acknowledged.
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { targetType, targetId, reason } = (await req.json().catch(() => ({}))) as {
    targetType?: string; targetId?: string; reason?: string;
  };
  if ((targetType !== 'post' && targetType !== 'trainer' && targetType !== 'material') || !targetId) {
    return NextResponse.json({ error: 'targetType post|trainer|material + targetId required' }, { status: 400 });
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
  if (targetType === 'material') {
    await prisma.material.updateMany({
      where: { id: targetId },
      data: { reportsCount: { increment: 1 } },
    });
  }
  // FR-12.7: instant alert when a target trips the velocity threshold.
  const openCount = await prisma.report.count({
    where: { targetType, targetId, status: 'open' },
  });
  if (openCount >= 3) {
    // A disputed material stops selling while it is disputed. The hold is
    // reversible (admin releases); a pirated file that keeps selling is not.
    if (targetType === 'material') {
      await prisma.material.updateMany({
        where: { id: targetId, status: 'live' },
        data: { status: 'held' },
      });
    }
    void flagAlert({ targetType, targetId, openCount, reason });
  }
  await notify({
    userIds: [userId], type: 'report-received',
    payload: { targetType, targetId },
    email: null,
  });
  return NextResponse.json({ report }, { status: 201 });
}
