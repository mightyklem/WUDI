import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/attendance/correction-request { sessionId, note }
// Participant flags a missed/incorrect attendance mark (FR-7.6).
// Routes to the trainer + active moderators as inbox notifications.
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sessionId, note } = (await req.json().catch(() => ({}))) as {
    sessionId?: string; note?: string;
  };
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  const session = await prisma.session.findUnique({
    where: { id: sessionId }, include: { training: true },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId: session.trainingId, userId } },
  });
  if (!reg || reg.status !== 'active') {
    return NextResponse.json({ error: 'Not registered' }, { status: 403 });
  }
  const mods = await prisma.moderator.findMany({
    where: { trainingId: session.trainingId, status: 'active' }, select: { userId: true },
  });
  const recipients = [session.training.trainerId, ...mods.map((m) => m.userId)];
  await prisma.notification.createMany({
    data: recipients.map((to) => ({
      userId: to,
      type: 'correction-request',
      payload: {
        trainingId: session.trainingId, sessionId, fromUserId: userId,
        note: (note || '').slice(0, 500),
      },
    })),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
