import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { badgeState } from '@/lib/verification';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trainers/[id] — public trainer profile.
 *
 * Includes the review summary, because a rating is only useful to a learner if it is
 * visible where they choose between trainers.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: id },
    include: {
      user: { select: { suspended: true } },
      application: true,
    },
  });
  if (!profile || profile.user.suspended) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const agg = await prisma.trainerReview.aggregate({
    where: { trainerId: id },
    _avg: { rating: true },
    _count: true,
  });

  const recent = await prisma.trainerReview.findMany({
    where: { trainerId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { author: { select: { id: true } } },
  });

  return NextResponse.json({
    trainer: {
      userId: profile.userId,
      displayName: profile.displayName,
      bio: profile.bio,
      topics: profile.topics,
      photoUrl: profile.photoUrl,
      // Derived, never stored as a flag -- see lib/verification.ts.
      badge: badgeState(profile.application),
    },
    reviews: {
      average: agg._count ? Math.round((agg._avg.rating || 0) * 10) / 10 : null,
      count: agg._count,
      // Author ids only. Reviews are public, but attaching a display name to every
      // one turns the page into a directory of who attended what.
      recent: recent.map((r) => ({
        rating: r.rating, body: r.body, createdAt: r.createdAt, authorId: r.author.id,
      })),
    },
  });
}