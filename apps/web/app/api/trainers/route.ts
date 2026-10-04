import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/trainers — list trainer profiles (Phase 1: simple list, capped)
export async function GET() {
  const trainers = await prisma.trainerProfile.findMany({
    take: 50,
    orderBy: { userId: 'asc' },
    select: { userId: true, displayName: true, photoUrl: true, bio: true, topics: true },
  });
  return NextResponse.json({ trainers });
}
