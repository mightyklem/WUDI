import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { mintRoomToken, type RoomRole } from '@/lib/livekit';
import { isAdmin } from '@/lib/admin';
import { canPublishInRoom } from '@learnovize/shared/room-access';

export const dynamic = 'force-dynamic';

/**
 * Who is this person in this session?
 *
 * Extracted so the pre-join screen and the token mint cannot disagree. They used
 * to be two separate decisions, and the result was a trainer being told "you will
 * join as a listener" and offered a button reading "Join as listener" -- because
 * the lobby had to guess a role that was only computed later, at token time.
 */
async function resolveRole(
  userId: string,
  session: {
    trainingId: string;
    dayId: string | null;
    training: { trainerId: string };
  },
): Promise<RoomRole | null> {
  if (session.training.trainerId === userId) return 'trainer';
  if (await isAdmin(userId)) {
    // Staff can enter any classroom to settle a dispute. They skip the enrolment check
    // below, which is correct -- an admin is not a learner and has no day seat. The
    // webhook refuses to record attendance for them, so observing costs no one a
    // certificate.
    return 'admin';
  }
  const mod = await prisma.moderator.findUnique({
    where: { trainingId_userId: { trainingId: session.trainingId, userId } },
  });
  if (mod && mod.status === 'active') return 'moderator';

  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId: session.trainingId, userId } },
  });
  // A registration for the class is not enough. Learners pick specific days, and
  // a seat on Day 1 must not admit them to Day 3 -- otherwise attendance and
  // certificates are measured against days they never paid for or chose.
  // Registering for free days still counts: the choice was theirs.
  if (!reg || reg.status !== 'active') return null;
  if (!session.dayId) return 'participant';
  const enrolled = await prisma.dayEnrollment.findUnique({
    where: { registrationId_dayId: { registrationId: reg.id, dayId: session.dayId } },
  });
  return enrolled ? 'participant' : null;
}

/**
 * GET /api/sessions/[id]/token -- who would I be in this room, and may I enter?
 *
 * Mints nothing. The pre-join screen needs to know it is looking at the trainer
 * so it can offer a camera check instead of a listener's mute-only notice, and
 * asking for a room pass just to read a role would hand out a credential before
 * anyone chose to join.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, trainingId: true, dayId: true, startsAtUtc: true, endsAtUtc: true, status: true, training: { select: { trainerId: true } } },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const role = await resolveRole(userId, session);
  const past = session.endsAtUtc.getTime() + 15 * 60_000;
  const finished = Date.now() > past || session.status === 'ended' || session.status === 'cancelled';
  const speaker = role === 'trainer' || role === 'moderator' || role === 'admin';

  return NextResponse.json({
    role,
    admitted: !!role && !finished,
    finished,
    startsInMs: Math.max(0, session.startsAtUtc.getTime() - Date.now()),
    // Whether the person will be muted on arrival. The client uses this to enable
    // the mic and camera automatically for staff and never for a learner.
    startsWithMic: speaker,
  });
}

// POST /api/sessions/[id]/token — mint a role-scoped LiveKit token (2h TTL).
// Role is resolved server-side, never trusted from the client:
// admin (staff) > trainer (owns training) > active moderator > registered participant.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { training: true },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status === 'ended' || session.status === 'cancelled') {
    return NextResponse.json({ error: 'Session is over' }, { status: 409 });
  }

  // Status alone is not enough. A session whose end time has passed still reads
  // 'scheduled' until someone ends it by hand, so the token route was minting
  // passes for classes that had already finished -- and LiveKit's refusal to join
  // then surfaced to the trainer as a bare connection failure. The clock is the
  // truth here; the status is bookkeeping that can lag it.
  //
  // Trainers are still admitted after the hour ends, but only for a short grace
  // window, because the room is genuinely still useful while people are leaving
  // and shutting it instantly strands anyone a minute behind.
  const GRACE_MINUTES = 15;
  const past = session.endsAtUtc.getTime() + GRACE_MINUTES * 60_000;
  if (Date.now() > past) {
    return NextResponse.json(
      {
        error: 'This session has finished',
        detail: `It ended at ${session.endsAtUtc.toISOString()}. Joining later cannot earn attendance.`,
      },
      { status: 409 },
    );
  }
  const inGrace = Date.now() > session.endsAtUtc.getTime();

  let role: RoomRole | null = await resolveRole(userId, session);
  if (!role) {
    return NextResponse.json(
      { error: 'You did not register for this day of the class' },
      { status: 403 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.suspended) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Staff entering a room leaves a record. The room itself already tells everyone an
  // admin is watching, but that notice is ephemeral: it is gone once the tab closes, and
  // the attendance webhook deliberately skips admins so observing costs nobody a
  // certificate. The consequence was that an admin could sit through an entire class and
  // there was no evidence afterwards that they had ever been there -- which is precisely
  // backwards if they were there because someone disputed what happened.
  //
  // Written here rather than on the LiveKit join event because this is the moment staff
  // ask to enter, it is server-side and cannot be bypassed by a client that skips it, and
  // it fires even if the websocket never connects.
  if (role === 'admin') {
    await prisma.auditLog.create({
      data: { actorId: userId, action: 'admin.observe', target: `session:${id}` },
    });
  }

  // Re-apply a speech grant the trainer already gave.
  //
  // LiveKit permissions live on the connection, so anyone who was allowed to speak
  // and then reconnected came back muted with no explanation and a hand still
  // raised from before. A learner losing the floor to a dropped signal reads as a
  // broken room, so the grant is read back here and restored on every join.
  const grant = role === 'participant'
    ? await prisma.speechGrant.findUnique({
        where: { sessionId_userId: { sessionId: id, userId } },
      })
    : null;
const canPublish = canPublishInRoom(role, !!grant && !grant.revokedAt);

    const jwt = await mintRoomToken({
      identity: userId,
      name: user?.email || userId,
      room: session.livekitRoom,
      role,
      canPublishOverride: canPublish,
    });
    // The room is told who it is looking at through token metadata, and the client
    // uses this flag to decide whether to switch the mic and camera on by itself.
    // Getting it wrong meant the trainer joining muted with no way to fix it.
    return NextResponse.json({
      token: jwt,
      url: process.env.LIVEKIT_URL,
      room: session.livekitRoom,
      role,
      trainerId: session.training.trainerId,
      canPublish: canPublishInRoom(role, !!grant && !grant.revokedAt),
    });
  }
