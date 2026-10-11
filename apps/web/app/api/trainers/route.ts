import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { badgeState } from '@/lib/verification';

export const dynamic = 'force-dynamic';

// GET /api/trainers — list trainer profiles, capped.
//
// Includes the badge so the directory shows who has actually been reviewed. The derived
// state travels with each row rather than being fetched per card.
export async function GET() {
  const trainers = await prisma.trainerProfile.findMany({
    take: 50,
    orderBy: { userId: 'asc' },
    select: {
      userId: true, displayName: true, photoUrl: true, bio: true, topics: true,
      application: { select: { status: true, finalRating: true, badgeExpiresAt: true } },
    },
  });

  // One aggregate for the whole directory rather than a count query per trainer.
  const ids = trainers.map((t) => t.userId);
  const counts = ids.length
    ? await prisma.trainerReview.groupBy({ by: ['trainerId'], where: { trainerId: { in: ids } }, _avg: { rating: true }, _count: true })
    : [];
  const stats = new Map(counts.map((c) => [c.trainerId, c]));

  return NextResponse.json({
    trainers: trainers.map(({ application, ...t }) => {
      const s = stats.get(t.userId);
      return {
        ...t,
        badge: badgeState(application),
        reviewAverage: s?._count ? Math.round((s._avg.rating || 0) * 10) / 10 : null,
        reviewCount: s?._count ?? 0,
      };
    }),
  });
}