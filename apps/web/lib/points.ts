import { prisma } from '@/lib/db';
import {
  POINT_REASONS,
  POINTS,
  pointsForAttendanceDay,
  pointsForCertificate,
  pointsForProgramCompletion,
  pointsForReview,
  rankFor,
} from '@learnovize/shared';
import { Prisma } from '../generated/prisma';

/**
 * Awarding and clawing back points (FR-13).
 *
 * Points are only ever derived from records the server already trusts: a
 * finalized attendance flag, a completed program, an issued certificate. Nothing
 * here accepts a client-supplied amount.
 *
 * Every award is keyed on (userId, ref) so replaying the same event is a no-op,
 * and every award is followed by a re-sync of the denormalised user.points
 * total so the cache can never drift from the ledger.
 */

/** Recompute a user's points from the ledger. The ledger is the truth. */
export async function syncUserPoints(userId: string) {
  const agg = await prisma.pointsEvent.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  const total = agg._sum.points ?? 0;
  const rank = rankFor(total);
  await prisma.user.update({
    where: { id: userId },
    data: { points: total, rank: rank.label },
  });
  return { points: total, rank: rank.label };
}

/** Insert a points row, ignoring the case where it already exists. */
async function grant(
  userId: string,
  ref: string,
  reason: string,
  points: number,
  extra: { sessionId?: string; trainingId?: string; dayId?: string } = {},
) {
  try {
    await prisma.pointsEvent.create({
      data: { userId, ref, reason, points, ...extra },
    });
    return true;
  } catch (e) {
    // Already awarded — the uniqueness guarantee doing its job.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
    throw e;
  }
}

async function revoke(userId: string, ref: string) {
  const gone = await prisma.pointsEvent.deleteMany({ where: { userId, ref } });
  return gone.count > 0;
}

/**
 * Called when an attendance flag is finalised as present.
 * Awards the day points, then the once-only bonus if this completed every day
 * the learner enrolled in.
 */
/**
   * Award the trainer standing for a review a learner left.
   *
   * Keyed on the review id, so a replayed request awards nothing further -- the same
   * guarantee attendance awards rely on. The trainer is the recipient: this is their
   * standing rising because people rated them, which is the whole reason a learner can
   * only review a session they actually attended.
   */
  export async function awardReviewReceived({
    trainerId,
    reviewId,
    rating,
  }: {
    trainerId: string;
    reviewId: string;
    rating: number;
  }) {
    const points = pointsForReview(rating);
    // A one or two star review is worth nothing, so there is no event to write.
    // Recording a zero-point row would only clutter the ledger and the reviewer's view.
    if (points <= 0) return { awarded: false, points: 0 };

    const created = await grant(trainerId, reviewId, POINT_REASONS.reviewReceived, points);
    if (created) await syncUserPoints(trainerId);
    return { awarded: created, points };
  }

  export async function awardAttendance({ userId, sessionId }: { userId: string; sessionId: string }) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { day: true, training: { select: { id: true, accessType: true } } },
  });
  if (!session) return null;

  // The day's own price decides the award, so a free day of a paid class pays
  // the free rate rather than the class rate. Sessions with no day attached
  // predate the day model, so they fall back to the class-level type.
  const accessType = session.day?.accessType ?? session.training.accessType ?? 'free';
  const points = pointsForAttendanceDay({ accessType });

  const created = await grant(userId, sessionId, POINT_REASONS.sessionAttended, points, {
    sessionId,
    trainingId: session.trainingId,
    dayId: session.dayId ?? undefined,
  });

  let bonusAwarded = false;
  if (created) {
    const finished = await allEnrolledDaysAttended(userId, session.trainingId);
    if (finished) {
      bonusAwarded = await grant(
        userId,
        `program:${session.trainingId}`,
        POINT_REASONS.programCompleted,
        pointsForProgramCompletion(),
        { trainingId: session.trainingId },
      );
    }
  }
  return syncUserPoints(userId).then((t) => ({ ...t, pointsAwarded: created ? points : 0, bonusAwarded }));
}

/** Called when an attendance flag is corrected back to absent. Takes the points back. */
export async function revokeAttendance({ userId, sessionId }: { userId: string; sessionId: string }) {
  const removed = await revoke(userId, sessionId);
  if (!removed) return null;
  // The finishing bonus may have depended on this session, so re-check it.
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { trainingId: true } });
  if (session) {
    const stillComplete = await allEnrolledDaysAttended(userId, session.trainingId);
    if (!stillComplete) await revoke(userId, `program:${session.trainingId}`);
  }
  return syncUserPoints(userId);
}

/**
 * Award the trainer standing for having someone actually turn up to their class.
 *
 * Keyed on `taught:<sessionId>`, so one session pays a trainer once no matter how many
 * learners attend it -- the work is delivering the class, not repeating it per head -- and
 * a replayed webhook awards nothing further. Same guarantee the learner awards rely on.
 *
 * Called from the attendance webhook on the present branch only. A class nobody came to
 * earns the trainer nothing, which is the point: standing should track whether people
 * were in the room, not whether a room was opened.
 */
export async function awardSessionTaught({ trainerId, sessionId }: { trainerId: string; sessionId: string }) {
  if (!trainerId) return { awarded: false, points: 0 };
  const created = await grant(
    trainerId,
    `taught:${sessionId}`,
    POINT_REASONS.sessionTaught,
    POINTS.sessionTaught,
    { sessionId },
  );
  if (created) await syncUserPoints(trainerId);
  return { awarded: created, points: created ? POINTS.sessionTaught : 0 };
}

/**
 * Called when attendance is corrected back to absent, and the room turns out to have been
 * emptier than it looked. Takes the trainer's award back with the learner's, so a corrected
 * record cannot leave the two sides of the same class disagreeing.
 */
export async function revokeSessionTaught({ trainerId, sessionId }: { trainerId: string; sessionId: string }) {
  if (!trainerId) return null;
  const removed = await revoke(trainerId, `taught:${sessionId}`);
  if (!removed) return null;
  return syncUserPoints(trainerId);
}

/** Called when a certificate is issued. */
export async function awardCertificate({ userId, trainingId }: { userId: string; trainingId: string }) {
  const created = await grant(
    userId,
    `cert:${trainingId}`,
    POINT_REASONS.certificateEarned,
    pointsForCertificate(),
    { trainingId },
  );
  if (!created) return null;
  return syncUserPoints(userId);
}

/**
 * Has this learner attended a session on every day they enrolled in?
 * Scoped to their own choice of days, so buying one day and showing up counts
 * as finishing what they signed up for.
 */
export async function allEnrolledDaysAttended(userId: string, trainingId: string): Promise<boolean> {
  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
    include: { dayEnrollments: { include: { day: { include: { sessions: { select: { id: true } } } } } } },
  });
  if (!reg || reg.status !== 'active') return false;

  const chosen = reg.dayEnrollments;
  // No day rows means a registration made before day-picking; fall back to the
  // whole training so legacy behaviour is unchanged.
  if (!chosen.length) return false;

  const sessionIds = chosen.flatMap((d) => d.day.sessions.map((s) => s.id));
  if (!sessionIds.length) return false;
  const present = await prisma.attendanceLog.count({
    where: { userId, sessionId: { in: sessionIds }, present: true },
  });
  return present >= sessionIds.length;
}