import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { roomService } from '@/lib/livekit';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// POST /api/sessions/[id]/moderate { action: 'mute'|'allowSpeak'|'remove'|'end', identity? }
// Trainer or active moderator only. Mute/remove target one participant; end closes the room.
//
// Learners are minted with canPublish:false, so a class is listen-only by default and
// cheap on data. 'allowSpeak' is how a learner who raised a hand actually gets to talk:
// the server grants that one participant publish rights. It is server-side on purpose, so
// a learner cannot grant themselves the ability to speak by sending a data-channel message.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { action, identity } = (await req.json().catch(() => ({}))) as {
    action?: string; identity?: string;
  };

  const session = await prisma.session.findUnique({
    where: { id }, include: { training: true },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const isTrainer = session.training.trainerId === userId;
  const mod = await prisma.moderator.findUnique({
    where: { trainingId_userId: { trainingId: session.trainingId, userId } },
  });
  const isMod = !!mod && mod.status === 'active';
  // Admin moderates too, so they can settle a dispute rather than just watch it. They are
  // not a moderator though -- the distinction is what stops them ending the class below.
  const isStaff = await isAdmin(userId);
  if (!isTrainer && !isMod && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const svc = roomService();
  if (action === 'end') {
    if (!isTrainer) return NextResponse.json({ error: 'Only the trainer can end' }, { status: 403 });
    await svc.deleteRoom(session.livekitRoom).catch(() => {});
    await prisma.session.update({ where: { id }, data: { status: 'ended' } });
    return NextResponse.json({ ok: true });
  }
  if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 });
  // There is deliberately no "remove" action. Kicking someone out of a session they
  // registered for and are trying to complete destroys their attendance for no good
  // reason, and a mis-click cannot be undone from inside the room. Leaving is the
  // participant's own decision; a moderator mutes, and can lower attendance
  // deliberately via the trainer attendance screen instead.
  if (action === 'mute' || action === 'allowSpeak') {
    const canPublish = action === 'allowSpeak';
    try {
      await svc.updateParticipant(session.livekitRoom, identity, {
        permission: { canPublish, canSubscribe: true, canPublishData: true },
      });
    } catch (e) {
      // LiveKit only tracks participants that are actually connected. A trainer
      // clicking this on someone who just dropped would otherwise get a 500, so
      // say plainly what happened.
      const detail = e instanceof Error ? e.message : String(e);
      const gone = /does not exist|not found/i.test(detail);
      return NextResponse.json(
        {
          error: gone
            ? 'That learner is no longer in the room'
            : 'Could not change their permission',
        },
        { status: gone ? 409 : 502 },
      );
    }

    // Persisted, not just applied to the live room. LiveKit permissions belong to
    // one connection, so a learner who was granted the floor and then lost signal,
    // backgrounded their phone, or reloaded the page dropped silently back to
    // listen-only -- and the hand queue disagreed with the room they were in. The
    // token route reads this row back and re-applies the grant on every join.
    if (canPublish) {
      await prisma.speechGrant.upsert({
        where: { sessionId_userId: { sessionId: id, userId: identity } },
        update: { revokedAt: null },
        create: { sessionId: id, userId: identity },
      });
    } else {
      await prisma.speechGrant.updateMany({
        where: { sessionId: id, userId: identity, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    // Worth recording: who was allowed to speak, and when. Admin actions are audited
    // under the same log as everyone else's, so an intervention in someone's class is
    // always traceable afterwards.
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: isStaff && !isTrainer && !isMod
          ? `admin.${canPublish ? 'allow-speech' : 'mute'}`
          : canPublish ? 'participant.allow-speech' : 'participant.mute',
        target: `session:${id} user:${identity}`,
        reason: canPublish ? 'raised hand' : null,
      },
    });
    return NextResponse.json({ ok: true, canPublish });
  }
  if (action === 'remove') {
    return NextResponse.json(
      { error: 'Participants leave a session themselves. Use mute, or correct attendance deliberately.' },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
