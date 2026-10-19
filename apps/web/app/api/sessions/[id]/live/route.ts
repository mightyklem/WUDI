import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sessions/[id]/live — is this room open, really?
 *
 * The classroom page is server-rendered once, on navigation. That is fine for a page you
 * arrive at after the room opened and useless for a page you are already sitting on: a
 * learner who loaded it early was told "Waiting for the host", and nothing ever told them
 * otherwise, so they refreshed or gave up. The only truth about whether a class is running
 * lives in the database, and nothing was asking it.
 *
 * Deliberately narrow. Timing and the open flag only -- no trainer, no seats, no attendee
 * list. It is polled by anyone holding the link, including people who have not registered,
 * so there is nothing here worth guessing at. The page it complements already prints the
 * same class name, trainer and times to the same reader.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      admittedAtUtc: true,
      endedAtUtc: true,
      startsAtUtc: true,
      endsAtUtc: true,
      status: true,
    },
  });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();
  const scheduledEnd = session.endsAtUtc.getTime();
  const isPastScheduledEnd = now.getTime() > scheduledEnd;

  // Auto-end sessions that have passed their scheduled end time
  let status = session.status;
  let endedAtUtc = session.endedAtUtc;
  if (isPastScheduledEnd && session.status !== 'ended' && session.status !== 'cancelled') {
    await prisma.session.update({
      where: { id },
      data: { status: 'ended', endedAtUtc: new Date() },
    });
    status = 'ended';
  }

  return NextResponse.json(
    {
      admittedAtUtc: session.admittedAtUtc?.toISOString() ?? null,
      endedAtUtc: session.endedAtUtc?.toISOString() ?? null,
      startsAtUtc: session.startsAtUtc.toISOString(),
      endsAtUtc: session.endsAtUtc.toISOString(),
      status,
      // True while the trainer is in the room, and -- crucially -- still true after the
      // scheduled end. Real classes overrun; the clock is not the authority on whether
      // this one is over, the trainer pressing End is.
      roomOpen: !!session.admittedAtUtc && status !== 'ended',
    },
    // Must not be cached: the whole point is to notice a change.
    { headers: { 'cache-control': 'no-store' } },
  );
}