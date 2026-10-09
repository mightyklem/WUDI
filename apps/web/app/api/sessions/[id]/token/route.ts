import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { mintRoomToken, type RoomRole } from '@/lib/livekit';

export const dynamic = 'force-dynamic';

// POST /api/sessions/[id]/token — mint a role-scoped LiveKit token (2h TTL).
// Role is resolved server-side, never trusted from the client:
// trainer (owns training) > active moderator > registered participant.
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

  let role: RoomRole | null = null;
  if (session.training.trainerId === userId) {
    role = 'trainer';
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
  const jwt = await mintRoomToken({
    identity: userId,
    name: user?.email || userId,
    room: session.livekitRoom,
    role,
  });
  return NextResponse.json({
    token: jwt,
    url: process.env.LIVEKIT_URL,
    room: session.livekitRoom,
    role,
  });
}
