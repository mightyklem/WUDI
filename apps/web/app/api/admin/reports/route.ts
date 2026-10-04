import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Scam-adjacent keywords that push a report up the queue (FR-12.6). Kept short
// and visible — tuning this list is a moderation decision, not code.
const FLAG_WORDS = ['get rich', 'double your money', 'crypto giveaway', 'forex guaranteed', 'click this link to earn'];

function flagScore(reason: string, recentCount: number): { score: number; flags: string[] } {
  const flags: string[] = [];
  const lower = (reason || '').toLowerCase();
  for (const w of FLAG_WORDS) {
    if (lower.includes(w)) flags.push(`keyword:${w}`);
  }
  if (recentCount >= 3) flags.push('velocity:3+ reports');
  return { score: flags.length * 10 + Math.min(recentCount, 10), flags };
}

// GET /api/admin/reports?status=open — unified review queue (FR-12.5).
// Auto-flags float to the top, then newest first (FR-12.6).
export async function GET(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'open';
  const reports = await prisma.report.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  // Velocity: open reports per target in the last hour.
  const since = new Date(Date.now() - 3600 * 1000);
  const recent = await prisma.report.groupBy({
    by: ['targetId'],
    where: { status: 'open', createdAt: { gte: since } },
    _count: { _all: true },
  });
  const velocity = new Map(recent.map((r) => [r.targetId, r._count._all]));
  const items = reports.map((r) => {
    const { score, flags } = flagScore(r.reason, velocity.get(r.targetId) || 0);
    return { ...r, autoFlags: flags, score };
  });
  items.sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime());
  return NextResponse.json({ reports: items });
}
