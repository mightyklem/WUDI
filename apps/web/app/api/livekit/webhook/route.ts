import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhook } from '@/lib/livekit';
import { isPresent } from '@learnovize/shared';
import { awardAttendance, revokeAttendance } from '@/lib/points';
import { computeEligibility } from '@/lib/certs';

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
      const present = isPresent(duration, stayed);
      await prisma.attendanceLog.update({
        where: { sessionId_userId: { sessionId: session.id, userId: evt.identity } },
        data: { leftAt: new Date(), stayedMs: stayed, present },
      });
      // FR-7.6: confirm the recording, and warn while still fixable.
      await prisma.notification.create({
        data: {
          userId: evt.identity, type: 'attendance-recorded',
          payload: { trainingId: session.trainingId, sessionId: session.id, present },
        },
      });
      // Verified attendance is what earns points (FR-13). Absent, nothing.
      if (present) {
        await awardAttendance({ userId: evt.identity, sessionId: session.id });
      } else {
        await revokeAttendance({ userId: evt.identity, sessionId: session.id });
      }

      const training = await prisma.training.findUnique({
        where: { id: session.trainingId },
        include: { sessions: { orderBy: { startsAtUtc: 'asc' } } },
      });
      if (training) {
        // Scoped to the days this learner enrolled in, not the whole class.
        const e = await computeEligibility(session.trainingId, evt.identity);
        const remaining = training.sessions.filter((s) => s.endsAtUtc.getTime() > Date.now()).length;
        if (!e.minMet && remaining > 0 && e.total > 0) {
          await prisma.notification.create({
            data: {
              userId: evt.identity, type: 'attendance-at-risk',
              payload: { trainingId: session.trainingId, pct: e.pct, minPct: training.minPct, remaining },
            },
          });
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
