import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { remindUpcoming } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/upcoming — the classes this learner has a seat in, soonest first.
 *
 * This exists because "what is my next class and when does it start" was answerable in the
 * database and on no screen. Someone who had paid had to remember what they had signed up
 * for, work out what time it was in Lagos, and then find the right room. Every one of those
 * is a step where a person gives up and never turns up, and a learner who never turns up is
 * the single most expensive thing that can happen to this business.
 *
 * Two deliberately different buckets, because they need different words:
 *
 *   next     has not started. This is the reminder -- "in 2 days, 3:00pm WAT"
 *   now      started and not finished. This is the nudge -- a class in progress is
 *            joinable, and a learner who is not in it is losing the thing they paid for.
 *
 * A session stays in `now` after its scheduled end while the trainer has not ended it,
 * because classes overrun and a room that is still live is still joinable.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();

  const regs = await prisma.registration.findMany({
    where: { userId, status: 'active' },
    select: {
      training: {
        select: {
          id: true,
          title: true,
          accessType: true,
          sessions: {
            orderBy: { startsAtUtc: 'asc' },
            select: {
              id: true,
              startsAtUtc: true,
              endsAtUtc: true,
              admittedAtUtc: true,
              endedAtUtc: true,
              status: true,
              agenda: true,
            },
          },
        },
      },
    },
  });

  type Row = {
    sessionId: string;
    trainingId: string;
    title: string;
    startsAtUtc: string;
    endsAtUtc: string;
    path: string;
    live: boolean;
    over: boolean;
  };

  const now_: Row[] = [];
  const next: Row[] = [];

  for (const r of regs) {
    for (const s of r.training.sessions) {
      const start = s.startsAtUtc.getTime();
      const end = s.endsAtUtc.getTime();

      // Cancelled teaches nobody, and a finished room is not coming back.
      if (s.status === 'cancelled' || s.endedAtUtc) continue;

      // A class that ran past its end is still running if the trainer has not closed it.
      const runningOver = end < now && !!s.admittedAtUtc && s.status !== 'ended';

      if (end < now && !runningOver) continue; // genuinely over
      if (start > now + 30 * 24 * 3600 * 1000) continue; // not "upcoming", next season

      const row: Row = {
        sessionId: s.id,
        trainingId: r.training.id,
        title: r.training.title,
        startsAtUtc: s.startsAtUtc.toISOString(),
        endsAtUtc: s.endsAtUtc.toISOString(),
        path: `/classroom/${s.id}`,
        live: start <= now,
        over: runningOver,
      };
      if (row.live) now_.push(row);
      else next.push(row);
    }
  }

  next.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
  now_.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

// Fire the reminder before answering. It is keyed on the session and claimed before it
  // sends, so calling this on every load is harmless -- but doing it after the response
  // would mean a slow mail provider holds the page open.
  void remindUpcoming(userId).catch(() => undefined);

  return NextResponse.json(
    {
      now: now_.slice(0, 3),
      next: next.slice(0, 5),
      counts: { live: now_.length, upcoming: next.length },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}