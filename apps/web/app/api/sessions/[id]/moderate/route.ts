import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { roomService } from '@/lib/livekit';

export const dynamic = 'force-dynamic';

// POST /api/sessions/[id]/moderate { action: 'mute'|'remove'|'end', identity? }
// Trainer or active moderator only. Mute/remove target one participant; end closes the room.
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
  if (!isTrainer && !isMod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = roomService();
  if (action === 'end') {
    if (!isTrainer) return NextResponse.json({ error: 'Only the trainer can end' }, { status: 403 });
    await svc.deleteRoom(session.livekitRoom).catch(() => {});
    await prisma.session.update({ where: { id }, data: { status: 'ended' } });
    return NextResponse.json({ ok: true });
  }
  if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 });
  if (action === 'mute') {
    await svc.updateParticipant(session.livekitRoom, identity, { permission: { canPublish: false, canSubscribe: true, canPublishData: true } });
    return NextResponse.json({ ok: true });
  }
  if (action === 'remove') {
    await svc.removeParticipant(session.livekitRoom, identity);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
