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

  return NextResponse.json({
    trainers: trainers.map(({ application, ...t }) => ({ ...t, badge: badgeState(application) })),
  });
}