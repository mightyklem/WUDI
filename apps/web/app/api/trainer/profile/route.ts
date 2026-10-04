import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function authed(req: Request): Promise<string | null> {
  const token = getBearer(req);
  return token ? verifyAccessToken(token) : null;
}

// GET /api/trainer/profile — my trainer profile (or 404)
export async function GET(req: Request) {
  const userId = await authed(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: 'Not a trainer yet' }, { status: 404 });
  return NextResponse.json({ profile });
}

// PUT /api/trainer/profile — become a trainer / update profile (FR-1.2, FR-1.3)
export async function PUT(req: Request) {
  const userId = await authed(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string; photoUrl?: string; bio?: string; topics?: string[];
    logoUrl?: string; signatureUrl?: string;
  };
  if (!body.displayName || body.displayName.trim().length < 2) {
    return NextResponse.json({ error: 'Display name (2+ chars) required' }, { status: 400 });
  }
  const topics = Array.isArray(body.topics) ? body.topics.slice(0, 10) : [];
  const profile = await prisma.trainerProfile.upsert({
    where: { userId },
    create: {
      userId,
      displayName: body.displayName.trim(),
      photoUrl: body.photoUrl || null,
      bio: body.bio?.slice(0, 500) || null,
      topics,
      logoUrl: body.logoUrl || null,
      signatureUrl: body.signatureUrl || null,
    },
    update: {
      displayName: body.displayName.trim(),
      photoUrl: body.photoUrl || null,
      bio: body.bio?.slice(0, 500) || null,
      topics,
      logoUrl: body.logoUrl || null,
      signatureUrl: body.signatureUrl || null,
    },
  });
  return NextResponse.json({ profile });
}
