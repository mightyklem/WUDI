import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { roomService } from '@/lib/livekit';
import { isAdmin } from '@/lib/admin';

// POST /api/sessions/[id]/request-speak { identity }
// Trainer or active moderator only. Sends the target participant a request to
// unmute and speak. Persisted as a speech-requested notification so the learner
// sees it in their inbox and can act on it from the classroom or the Notifications tab.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { identity } = (await req.json().catch(() => ({}))) as { identity?: string };
  if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 });

  const session = await prisma.session.findUnique({
    where: { id }, include: { training: true },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const isTrainer = session.training.trainerId === userId;
  const mod = await prisma.moderator.findUnique({
    where: { trainingId_userId: { trainingId: session.trainingId, userId } },
  });
  const isMod = !!mod && mod.status === 'active';
  const isStaff = await isAdmin(userId);
  if (!isTrainer && !isMod && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Make sure the target is actually in the room.
  const svc = roomService();
  try {
    await svc.getParticipant(session.livekitRoom, identity);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const gone = /does not exist|not found/i.test(detail);
    return NextResponse.json(
      { error: gone ? 'That learner is no longer in the room' : 'Could not reach the room' },
      { status: gone ? 409 : 502 },
    );
  }

  await prisma.notification.create({
    data: {
      userId: identity,
      type: 'speech-requested',
      payload: { sessionId: id, trainingId: session.trainingId, title: session.training.title, requestedBy: userId },
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'participant.request-speech',
      target: `session:${id} user:${identity}`,
      reason: 'Trainer requested the learner to unmute and speak',
    },
  });
  return NextResponse.json({ ok: true });
}
