import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/sessions/[id]/timeline — what happened in one session.
 *
 * Reconstructs the room from records that already exist, rather than recording media.
 * Nothing here is audio or video: it is who was in the room, when, and every action
 * anyone took. That distinction is deliberate. A recording changes what a learner can
 * expect in a room, and this app promises in the class sheet that nothing is recorded,
 * so the honest way to answer "what happened?" is an event log, not a tape.
 *
 * Assembled from four sources because no single one tells the whole story:
 *
 *   AuditLog          every staff and moderator action, with a timestamp and a reason
 *   AttendanceLog     who was present and for how long
 *   Session           when the room was scheduled, opened, admitted and ended
 *   SpeechGrant       who held the floor and when it was taken back
 *
 * The AuditLog is the spine, but it is not sufficient alone: attendance is written by the
 * LiveKit webhook and never reaches the audit log, and a speaker being granted the floor
 * records an action without recording who was on screen. Merging them is what makes the
 * timeline usable in a dispute.
 *
 * Admin-only. A trainer can see their own attendance and moderation history already,
 * through the routes that serve the trainer view.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      training: {
        select: {
          id: true,
          title: true,
          trainerId: true,
          trainer: { select: { displayName: true } },
        },
      },
    },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const [audit, attendance, grants, moderators] = await Promise.all([
    // Scoped to this session's rows. The audit log is global, so without this filter an
    // admin looking at one class would be shown the entire platform's moderation history.
    prisma.auditLog.findMany({
      where: { OR: [{ target: { startsWith: `session:${id}` } }, { target: { startsWith: `training:${session.trainingId}` } }] },
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
    prisma.attendanceLog.findMany({
      where: { sessionId: id },
      include: { user: { select: { email: true } } },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.speechGrant.findMany({
      where: { sessionId: id },
      include: { user: { select: { email: true } } },
      orderBy: { grantedAt: 'asc' },
    }),
    prisma.moderator.findMany({
      where: { trainingId: session.trainingId },
      // displayName lives on TrainerProfile, not User. A moderator who is not a trainer
      // has no profile, so fall back to the email rather than dropping the row.
      include: { user: { select: { email: true, trainerProfile: { select: { displayName: true } } } } },
    }),
  ]);

  // Everything is already stored with its own timestamp, so the timeline is a merge
  // rather than a reconstruction. Each row carries where it came from, because "the
  // trainer muted someone at 14:02" and "a learner joined at 14:02" are different kinds
  // of fact and a reader should not have to guess which is which.
  const events = [
    ...audit.map((a) => ({
      at: a.createdAt.toISOString(),
      kind: 'action' as const,
      actor: a.actor.email,
      action: a.action,
      target: a.target,
      reason: a.reason,
    })),
    ...attendance
      .filter((l) => l.joinedAt)
      .map((l) => ({
        at: l.joinedAt!.toISOString(),
        kind: 'attendance' as const,
        actor: l.user.email,
        action: 'participant.joined',
        target: `session:${id} user:${l.userId}`,
        reason: null as string | null,
        stayedMs: l.stayedMs,
        leftAt: l.leftAt?.toISOString() ?? null,
      })),
    ...grants.map((g) => ({
      at: g.grantedAt.toISOString(),
      kind: 'speech' as const,
      actor: g.user.email,
      action: g.revokedAt ? 'speech.revoked' : 'speech.granted',
      target: `session:${id} user:${g.userId}`,
      reason: null as string | null,
      revokedAt: g.revokedAt?.toISOString() ?? null,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return NextResponse.json({
    session: {
      id: session.id,
      livekitRoom: session.livekitRoom,
      status: session.status,
      startsAtUtc: session.startsAtUtc.toISOString(),
      endsAtUtc: session.endsAtUtc.toISOString(),
      opensAtUtc: session.opensAtUtc?.toISOString() ?? null,
      admittedAtUtc: session.admittedAtUtc?.toISOString() ?? null,
      endedAtUtc: session.endedAtUtc?.toISOString() ?? null,
      training: session.training,
    },
    moderators,
    attendance,
    events,
    // What this log cannot tell you, stated rather than left for someone to assume.
    limits: {
      recorded: false,
      note:
        'No audio or video is captured. Chat, polls and raised hands travel over the LiveKit data channel and are not persisted, so they are absent from this timeline.',
    },
  });
}