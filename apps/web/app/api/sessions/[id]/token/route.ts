import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { mintRoomToken, type RoomRole } from '@/lib/livekit';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

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

  let role: RoomRole | null = null;
  if (session.training.trainerId === userId) {
    role = 'trainer';
  } else if (await isAdmin(userId)) {
    // Staff can enter any classroom to settle a dispute. They skip the enrolment check
    // below, which is correct -- an admin is not a learner and has no day seat. The
    // webhook refuses to record attendance for them, so observing costs no one a
    // certificate.
    role = 'admin';
  } else {
    const mod = await prisma.moderator.findUnique({
      where: { trainingId_userId: { trainingId: session.trainingId, userId } },
    });
    if (mod && mod.status === 'active') {
      role = 'moderator';
    } else {
      const reg = await prisma.registration.findUnique({
        where: { trainingId_userId: { trainingId: session.trainingId, userId } },
      });
      // A registration for the class is not enough. Learners pick specific days, and
      // a seat on Day 1 must not admit them to Day 3 — otherwise attendance and
      // certificates are measured against days they never paid for or chose.
      // Registering for free days still counts: the choice was theirs.
      if (reg && reg.status === 'active') {
        if (session.dayId) {
          const enrolled = await prisma.dayEnrollment.findUnique({
            where: { registrationId_dayId: { registrationId: reg.id, dayId: session.dayId } },
          });
          role = enrolled ? 'participant' : null;
        } else {
          // Session predates the day model, so fall back to the class registration.
          role = 'participant';
        }
      }
    }
  }
  if (!role) {
    return NextResponse.json(
      { error: 'You did not register for this day of the class' },
      { status: 403 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.suspended) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
  const canSpeak = !!grant && !grant.revokedAt;

  const jwt = await mintRoomToken({
    identity: userId,
    name: user?.email || userId,
    room: session.livekitRoom,
    role,
    // A granted learner is minted with publishing rights; everyone else is not.
    canPublishOverride: canSpeak,
  });
  return NextResponse.json({
    token: jwt,
    url: process.env.LIVEKIT_URL,
    room: session.livekitRoom,
    role,
  });
}
