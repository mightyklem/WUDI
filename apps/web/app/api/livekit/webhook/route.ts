import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhook } from '@/lib/livekit';
import { isPresent } from '@wudi/shared';

export const dynamic = 'force-dynamic';

// POST /api/livekit/webhook — LiveKit participant join/leave events (FR-7.2).
// Signature-verified. Feeds attendance_logs; present-state calc lives here,
// moderator corrections + program % land in Phase 4.
export async function POST(req: Request) {
  let evt: { event: string; room?: string; identity?: string };
  try {
    evt = await verifyWebhook(req);
  } catch {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }
  if (!evt.room || !evt.identity) return NextResponse.json({ ok: true });

  const session = await prisma.session.findFirst({ where: { livekitRoom: evt.room } });
  if (!session) return NextResponse.json({ ok: true });

  if (evt.event === 'participant_joined') {
    await prisma.attendanceLog.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: evt.identity } },
      create: { sessionId: session.id, userId: evt.identity, joinedAt: new Date(), stayedMs: 0, present: false },
      update: { joinedAt: new Date() },
    });
  } else if (evt.event === 'participant_left') {
    const log = await prisma.attendanceLog.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: evt.identity } },
    });
    const joined = log?.joinedAt?.getTime();
    if (joined) {
      const stayed = Date.now() - joined;
      const duration = session.endsAtUtc.getTime() - session.startsAtUtc.getTime();
      await prisma.attendanceLog.update({
        where: { sessionId_userId: { sessionId: session.id, userId: evt.identity } },
        data: { leftAt: new Date(), stayedMs: stayed, present: isPresent(duration, stayed) },
      });
    }
  }
  return NextResponse.json({ ok: true });
}
