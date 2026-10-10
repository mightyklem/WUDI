import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/trainers/[id]/reviews { sessionId, rating, body }
 *
 * Reviews drive a trainer's points, so the author has to be someone who was actually in
 * the room. Without that gate any account can rate any trainer and the number becomes
 * both worthless to learners and farmable by trainers -- which would quietly undo the
 * whole point of rating people on real outcomes.
 *
 * Eligibility is `AttendanceLog.present`, the same record the certificate uses, so a
 * corrected attendance record and a reviewable session cannot disagree.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: trainerId } = await ctx.params;

  let body: { sessionId?: string; rating?: number; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1 to 5' }, { status: 400 });
  }
  if (!body.sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

  // Cannot review yourself.
  if (trainerId === userId) {
    return NextResponse.json({ error: 'You cannot review yourself' }, { status: 403 });
  }

  const log = await prisma.attendanceLog.findUnique({
    where: { sessionId_userId: { sessionId: body.sessionId, userId } },
    include: { session: { include: { training: { select: { trainerId: true, title: true } } } } },
  });

  if (!log?.present) {
    return NextResponse.json(
      { error: 'Only participants who attended can review this trainer' },
      { status: 403 },
    );
  }
  if (log.session.training.trainerId !== trainerId) {
    // Otherwise attendance in one trainer's session would let you review a different one.
    return NextResponse.json({ error: 'That session was not with this trainer' }, { status: 403 });
  }

  const existing = await prisma.trainerReview.findUnique({
    where: { sessionId_authorId: { sessionId: body.sessionId, authorId: userId } },
  });
  if (existing) {
    return NextResponse.json({ error: 'You have already reviewed this session' }, { status: 409 });
  }

  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.trainerReview.create({
      data: {
        trainerId,
        authorId: userId,
        sessionId: body.sessionId!,
        rating,
        body: body.body?.slice(0, 2000) || null,
      },
    });
    // One review per session per learner, so this cannot be replayed for points.
    await tx.auditLog.create({
      data: { actorId: userId, action: 'review.created', target: r.id, reason: `${rating}/5` },
    });
    return r;
  });

  return NextResponse.json({ ok: true, review: { id: review.id, rating: review.rating } });
}