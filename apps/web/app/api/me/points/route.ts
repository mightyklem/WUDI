import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { rankFor, nextRankFor, pointsToNextRank, rankProgress } from '@learnovize/shared';

export const dynamic = 'force-dynamic';

// GET /api/me/points — the learner's balance, rank and progress.
// The rank is derived from the ledger here rather than read off the user row, so
// a stale cache can never show the wrong badge.
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [agg, recent] = await Promise.all([
    prisma.pointsEvent.aggregate({ where: { userId }, _sum: { points: true } }),
    prisma.pointsEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, points: true, reason: true, createdAt: true, trainingId: true },
    }),
  ]);

  const points = agg._sum.points ?? 0;
  const rank = rankFor(points);
  const next = nextRankFor(points);

  return NextResponse.json({
    points,
    rank: { key: rank.key, label: rank.label, icon: rank.icon },
    next: next ? { key: next.key, label: next.label, icon: next.icon, needed: pointsToNextRank(points) } : null,
    progress: rankProgress(points),
    recent,
  });
}