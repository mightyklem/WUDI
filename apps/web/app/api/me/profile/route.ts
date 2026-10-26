import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { validatePhotoUrl } from '@/lib/photo';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/profile -- my own profile, as others see it.
 *
 * A profile is a person, not a role. This returns the picture, the name and the about
 * for any account, whether or not it is a trainer, because every account has one and
 * only a trainer used to have anywhere to put it.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      photoUrl: true,
      bio: true,
      email: true,
      isOfficial: true,
      points: true,
      rank: true,
      createdAt: true,
      trainerProfile: {
        select: {
          displayName: true, topics: true, photoUrl: true, bio: true, logoUrl: true, signatureUrl: true,
        },
      },
    },
  });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ profile: user });
}

/**
 * PUT /api/me/profile -- change my picture, name or about.
 *
 * One surface, whatever the account is. A trainer's teaching name and about are kept in
 * step with the person's, because two different "about" fields on the same profile is
 * how a profile ends up saying one thing to a learner and another to an admin.
 */
export async function PUT(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    fullName?: string;
    bio?: string;
    photoUrl?: string;
  };

  const name = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : null;
  const bio = typeof body.bio === 'string' ? body.bio.trim() : null;

  if (name !== null && name.length < 2) {
    return NextResponse.json({ error: 'Your name needs at least two characters.' }, { status: 400 });
  }
  if (name !== null && name.length > 120) {
    return NextResponse.json({ error: 'That name is too long.' }, { status: 400 });
  }
  if (bio !== null && bio.length > 500) {
    return NextResponse.json({ error: 'Keep the about under 500 characters.' }, { status: 400 });
  }
  // A picture is a URL to an upload. It has to be one of ours, or a profile could point
  // anywhere -- including at a tracker on somebody else's page.
  const photoUrl = validatePhotoUrl(body.photoUrl);

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name !== null ? { fullName: name } : {}),
      ...(bio !== null ? { bio: bio || null } : {}),
      ...(body.photoUrl !== undefined ? { photoUrl } : {}),
    },
    select: { id: true, fullName: true, bio: true, photoUrl: true },
  });

  // A trainer has a second copy of the picture and the about, and it is the one the
  // public trainer page reads. It is updated here rather than on a second form, so the
  // two can never disagree.
  await prisma.trainerProfile.updateMany({
    where: { userId },
    data: {
      ...(name !== null ? { displayName: name } : {}),
      ...(bio !== null ? { bio: bio || null } : {}),
      ...(body.photoUrl !== undefined ? { photoUrl } : {}),
    },
  });

  return NextResponse.json({ profile: user });
}

