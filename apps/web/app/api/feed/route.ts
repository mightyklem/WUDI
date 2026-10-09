import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { renderECard } from '@/lib/ecard';
import { putPublic } from '@/lib/storage';
import { randomBytes } from 'crypto';

import { Prisma } from '../../../generated/prisma';

export const dynamic = 'force-dynamic';

// GET /api/feed?topic=&cert=free|certified|any&q=&from=&to=
// Upcoming trainings only: full trainings are marked, cancelled/finished removed (FR-10.8).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const topic = searchParams.get('topic') || undefined;
  const cert = searchParams.get('cert') || 'any'; // free|certified|any
  const q = searchParams.get('q') || undefined;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  // Ads are opt-in through ?ads=1 so Explore does not become a billboard by default.
  const adWindow = searchParams.get('ads') === '1';
  // ?following=1 narrows to trainers this person follows. Following used to
  // change nothing you could see — it only triggered an email.
  const followingOnly = searchParams.get('following') === '1';

  const token = getBearer(req);
  const me = token ? await verifyAccessToken(token) : null;

  // ?following=1 narrows to trainers this person follows. Following used to
  // change nothing you could see — it only triggered an email.
  let followedTrainerIds: string[] = [];
  if (followingOnly && me) {
    const follows = await prisma.follow.findMany({
      where: { followerId: me },
      select: { trainerId: true },
    });
    followedTrainerIds = follows.map((f) => f.trainerId);
  }

  // Official, announcement and ad posts are not tied to a class, so the class
  // filters only apply when the post has one. Built as a single object so the
  // class filters and the following filter merge rather than overwrite each other.
  const needsTraining = Boolean(from || to || q || topic || cert !== 'any' || followingOnly);
  const trainingFilter: Prisma.FeedPostWhereInput['training'] = needsTraining
    ? {
        status: { in: ['live', 'full'] },
        ...(topic ? { topic } : {}),
        ...(cert === 'free' ? { accessType: 'free' } : cert === 'certified' ? { certMode: 'paid' } : {}),
        ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
        ...(from || to
          ? { sessions: { some: { startsAtUtc: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            } } } }
          : {}),
        // A post counts as from someone you follow when the class behind it is
        // theirs. Official and announcement posts have no trainer, so they drop out
        // here rather than quietly reappearing under "following".
        ...(followingOnly ? { trainerId: { in: followedTrainerIds } } : {}),
      }
    : null;

  const posts = await prisma.feedPost.findMany({
    where: {
      status: 'live',
      ...(trainingFilter ? { training: trainingFilter } : {}),
      ...(adWindow ? {} : { isAd: false }),
    },
    include: {
      training: {
        include: {
          trainer: { select: { displayName: true } },
          sessions: { orderBy: { startsAtUtc: 'asc' }, take: 1 },
        },
      },
      author: { select: { isOfficial: true } },
      organization: { select: { name: true, slug: true, verification: true, logoUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // An empty "following" needs to say why, not render a blank feed.
  if (followingOnly && !posts.length) {
    return NextResponse.json({ posts: [], followingEmpty: true, followingCount: followedTrainerIds.length });
  }

  let liked: Set<string> = new Set();
  let saved: Set<string> = new Set();
  if (me) {
    const [likes, saves] = await Promise.all([
      prisma.like.findMany({ where: { userId: me } }),
      prisma.save.findMany({ where: { userId: me } }),
    ]);
    liked = new Set(likes.map((l) => l.postId));
    saved = new Set(saves.map((s) => s.trainingId));
  }
  return NextResponse.json({
    posts: await Promise.all(posts.map(async (p) => {
      // A post with no training is official content, an announcement, or an ad.
      const training = p.training
        ? {
            id: p.training.id, title: p.training.title, slug: p.training.slug,
            trainer: p.training.trainer.displayName, topic: p.training.topic,
            accessType: p.training.accessType, tier: p.training.tier,
            pricePerDayNgn: p.training.pricePerDayNgn,
            certMode: p.training.certMode,
            price: p.training.pricePerDayNgn
              ? { pricePerDayNgn: p.training.pricePerDayNgn }
              : null,
            status: p.training.status,
            seatsLeft: p.training.cap - p.training.seatsTaken,
            cap: p.training.cap,
            seatsTaken: p.training.seatsTaken,
            firstSession: p.training.sessions[0]?.startsAtUtc || null,
          }
        : null;
      return {
        id: p.id, type: p.type, mediaUrl: p.mediaUrl,
        kind: p.kind,
        title: p.title,
        body: p.body,
        thumbUrl: p.thumbUrl,
        isAd: p.isAd,
        adTargetType: p.adTargetType,
        adTargetId: p.adTargetId,
        // The verified badge: official Learnovize accounts and verified orgs.
        isOfficial: p.author?.isOfficial === true || p.organization?.verification === 'verified',
        organization: p.organization
          ? { name: p.organization.name, slug: p.organization.slug, logoUrl: p.organization.logoUrl }
          : null,
        training,
        liked: liked.has(p.id),
        saved: p.training ? saved.has(p.training.id) : false,
        likeCount: await prisma.like.count({ where: { postId: p.id } }),
      };
    })),
  });
}

const VIDEO_MAX = 50 * 1024 * 1024; // 50MB, ≤60s enforced client-side + duration note
const IMAGE_MAX = 5 * 1024 * 1024;

// POST /api/feed — trainer creates a post for their training (FR-10.6).
// multipart: trainingId, type=video|ecard|infographic, file? (video mp4 ≤50MB, image ≤5MB).
// type=ecard without file auto-generates the platform template.
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const trainingId = String(form?.get('trainingId') || '');
  const type = String(form?.get('type') || '');
  if (!['video', 'ecard', 'infographic'].includes(type)) {
    return NextResponse.json({ error: 'type must be video|ecard|infographic' }, { status: 400 });
  }
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: { trainer: true, sessions: { orderBy: { startsAtUtc: 'asc' }, take: 1 } },
  });
  if (!training || training.trainerId !== userId) {
    return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 });
  }
  if (training.status === 'cancelled' || training.status === 'finished') {
    return NextResponse.json({ error: 'Training is over' }, { status: 409 });
  }

  let mediaUrl: string;
  const file = form?.get('file');
  if (file instanceof Blob && file.size > 0) {
    const max = type === 'video' ? VIDEO_MAX : IMAGE_MAX;
    const allowed =
      type === 'video' ? ['video/mp4'] : ['image/jpeg', 'image/png'];
    if (file.size > max) return NextResponse.json({ error: `File too large (max ${max / 1048576}MB)` }, { status: 413 });
    if (!allowed.includes(file.type)) return NextResponse.json({ error: `Type ${file.type} not allowed for ${type}` }, { status: 415 });
    const ext = (file.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '');
    const key = `feed/${trainingId}/${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
    mediaUrl = await putPublic(key, new Uint8Array(await file.arrayBuffer()), file.type);
  } else if (type === 'ecard') {
    const first = training.sessions[0]?.startsAtUtc.toUTCString().slice(0, 16) || '';
    const { url } = await renderECard({
      title: training.title, trainer: training.trainer.displayName, when: first,
      cert: training.certMode === 'none' ? 'Free attendance' : `${training.certMode} certificate`,
      slug: training.slug,
    });
    mediaUrl = url;
  } else {
    return NextResponse.json({ error: 'Upload a file, or use type=ecard for the auto template' }, { status: 400 });
  }

  const post = await prisma.feedPost.create({
    // authorId was left null, so every post read as unattributed and the verified-badge
    // check had nothing to evaluate. A trainer's post belongs to that trainer.
    data: { trainingId, type, mediaUrl, authorId: userId, kind: 'training', status: 'live' },
  });
  return NextResponse.json({ post }, { status: 201 });
}
