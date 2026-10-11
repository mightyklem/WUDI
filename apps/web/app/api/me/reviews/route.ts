import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/reviews — sessions this learner attended and has not yet reviewed.
 *
 * Only sessions where attendance actually marked them present appear. This is the same
 * record the certificate uses, so a corrected attendance record and a reviewable
 * session cannot disagree.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const logs = await prisma.attendanceLog.findMany({
    where: { userId, present: true },
    include: {
      session: {
        include: {
          training: { select: { id: true, title: true, slug: true, trainerId: true, trainer: { select: { displayName: true } } } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });

  const sessionIds = logs.map((l) => l.sessionId);
  const existing = sessionIds.length
    ? await prisma.trainerReview.findMany({ where: { authorId: userId, sessionId: { in: sessionIds } }, select: { sessionId: true, rating: true } })
    : [];
  const done = new Map(existing.map((r) => [r.sessionId, r.rating]));

  return NextResponse.json({
    sessions: logs
      .filter((l) => l.session.training.trainerId !== userId)
      .map((l) => ({
        sessionId: l.sessionId,
        trainerId: l.session.training.trainerId,
        trainerName: l.session.training.trainer.displayName,
        trainingTitle: l.session.training.title,
        trainingSlug: l.session.training.slug,
        when: l.session.startsAtUtc,
        // null means not yet reviewed, which is what makes it actionable.
        myRating: done.get(l.sessionId) ?? null,
      })),
  });
}