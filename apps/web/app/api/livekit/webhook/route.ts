import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhook } from '@/lib/livekit';
import { mergeAttendanceWindow } from '@learnovize/shared';
import { awardAttendance, revokeAttendance } from '@/lib/points';
import { isAdmin } from '@/lib/admin';
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

  // Staff observe, they do not attend. An admin can now join any classroom, so their
  // join/leave events arrive here too -- and without this they would be written into
  // attendance_logs, awarded points, and could later earn a certificate for a class they
  // only watched. Observing is not attending.
  if (await isAdmin(evt.identity)) return NextResponse.json({ ok: true, skipped: 'admin' });

  if (evt.event === 'participant_joined') {
    // A rejoin opens a new window, so leftAt has to be cleared or it describes the
    // previous exit while the person is demonstrably still in the room.
    //
    // stayedMs is NOT reset. It is the running total across every window this learner
    // has spent in this session, and the previous version zeroed it on each join, which
    // quietly destroyed the earlier stay. A learner who attended 40 minutes, dropped on
    // a bad network, and rejoined for the last 20 was recorded as having stayed 20 --
    // below the 75% threshold, so present went false and a certificate they had earned
    // was denied. The zeroing was added to stop stayedMs describing a past stay; merging
    // is what actually does that, without discarding the time.
    //
    // present is left alone here and recomputed on leave, from the merged total.
    await prisma.attendanceLog.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: evt.identity } },
      create: { sessionId: session.id, userId: evt.identity, joinedAt: new Date(), stayedMs: 0, present: false },
      update: { joinedAt: new Date(), leftAt: null },
    });
  } else if (evt.event === 'participant_left') {
    const log = await prisma.attendanceLog.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: evt.identity } },
    });
    const joined = log?.joinedAt?.getTime();
    if (joined) {
      // Add this window to what was already accumulated, rather than replacing it.
      const duration = session.endsAtUtc.getTime() - session.startsAtUtc.getTime();
      const { stayedMs: stayed, present } = mergeAttendanceWindow(
        log?.stayedMs ?? 0,
        Date.now() - joined,
        duration,
      );
      await prisma.attendanceLog.update({
        where: { sessionId_userId: { sessionId: session.id, userId: evt.identity } },
        data: { leftAt: new Date(), stayedMs: stayed, present },
      });
      // Confirms attendance was recorded while it is still fixable. Not a recording of
      // the session -- no audio or video exists.
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
