import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { drawWinners } from '@learnovize/shared/giveaway';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sessions/[id]/giveaways
 *
 * Actions:
 *   create { prize, rules?, requiresPayment? }  trainer only
 *   enter  { giveawayId }                        any admitted attendee
 *   close  { giveawayId }                        trainer only
 *   draw   { giveawayId, count }                 trainer only
 *
 * The draw happens here, on the server, over the stored entry ids. Nothing about
 * the outcome is decided in the browser: a client that wanted to rig a draw could
 * simply post a filtered list of names, so the only list that counts is the one in
 * the database, and the result is written to an audit trail.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    giveawayId?: string;
    prize?: string;
    rules?: string;
    count?: number;
    requiresPayment?: boolean;
  };

  const session = await prisma.session.findUnique({
    where: { id },
    include: { training: { select: { trainerId: true, title: true } } },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const isTrainer = session.training.trainerId === userId;

  /* ------------------------------ create ------------------------------ */
  if (body.action === 'create') {
    if (!isTrainer) return NextResponse.json({ error: 'Only the trainer can start a giveaway' }, { status: 403 });
    const prize = String(body.prize || '').trim().slice(0, 120);
    if (!prize) return NextResponse.json({ error: 'A giveaway needs a prize' }, { status: 400 });
    const g = await prisma.giveaway.create({
      data: {
        sessionId: id,
        prize,
        rules: body.rules ? String(body.rules).slice(0, 500) : null,
        requiresPayment: !!body.requiresPayment,
      },
    });
    return NextResponse.json({ ok: true, giveaway: g });
  }

  /* ------------------------------ enter ------------------------------ */
  if (body.action === 'enter') {
    if (!body.giveawayId) return NextResponse.json({ error: 'giveawayId required' }, { status: 400 });
    const g = await prisma.giveaway.findUnique({
      where: { id: body.giveawayId },
      include: { _count: { select: { entries: true } } },
    });
    if (!g || g.sessionId !== id) return NextResponse.json({ error: 'No such giveaway' }, { status: 404 });
    if (!g.open) return NextResponse.json({ error: 'Entries are closed for this giveaway' }, { status: 409 });

    // Only someone actually entitled to this session may enter. A giveaway is a
    // reward for attending, so it draws from the room rather than the internet.
    const reg = await prisma.registration.findFirst({
      where: { trainingId: session.trainingId, userId, status: 'active' },
    });
    const attended = await prisma.attendanceLog.findUnique({
      where: { sessionId_userId: { sessionId: id, userId } },
      select: { present: true },
    });
    const isAttendee = attended?.present === true;
    if (!isTrainer && !reg && !isAttendee) {
      return NextResponse.json({ error: 'Only registered attendees can enter' }, { status: 403 });
    }

    // upsert, not create: the unique constraint already prevents a second entry,
    // and this turns a refresh into the same answer instead of a duplicate error.
    const entry = await prisma.giveawayEntry.upsert({
      where: { giveawayId_userId: { giveawayId: g.id, userId } },
      update: {},
      create: { giveawayId: g.id, userId },
    });
    const count = await prisma.giveawayEntry.count({ where: { giveawayId: g.id } });
    return NextResponse.json({ ok: true, entered: true, entryId: entry.id, entries: count });
  }

  /* ------------------------------ close ------------------------------ */
  if (body.action === 'close') {
    if (!isTrainer) return NextResponse.json({ error: 'Only the trainer can close entries' }, { status: 403 });
    if (!body.giveawayId) return NextResponse.json({ error: 'giveawayId required' }, { status: 400 });
    const g = await prisma.giveaway.update({
      where: { id: body.giveawayId },
      data: { open: false },
    });
    return NextResponse.json({ ok: true, giveaway: g });
  }

  /* ------------------------------- draw ------------------------------- */
  if (body.action === 'draw') {
    if (!isTrainer) return NextResponse.json({ error: 'Only the trainer can draw' }, { status: 403 });
    if (!body.giveawayId) return NextResponse.json({ error: 'giveawayId required' }, { status: 400 });

    const g = await prisma.giveaway.findUnique({
      where: { id: body.giveawayId },
      include: { entries: { select: { userId: true } } },
    });
    if (!g || g.sessionId !== id) return NextResponse.json({ error: 'No such giveaway' }, { status: 404 });
    if (g.drawnAt) return NextResponse.json({ error: 'This giveaway has already been drawn' }, { status: 409 });

    const count = Math.min(Math.max(1, Math.floor(Number(body.count) || 1)), 50);

    // crypto.randomInt is cryptographically uniform, so a participant cannot
    // predict the draw by timing repeated requests.
    const { winners, overflow } = drawWinners(
      g.entries.map((e) => e.userId),
      count,
      () => randomInt(0, 0x100000000) / 0x100000000,
    );

    const updated = await prisma.giveaway.update({
      where: { id: g.id },
      data: { winners: JSON.stringify(winners), drawnAt: new Date(), open: false },
    });

    // Recorded so the draw can be evidenced afterwards: who drew it, from how many
    // entries, and which accounts won.
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'giveaway.draw',
        target: `session:${id} giveaway:${g.id}`,
        reason: `${g.entries.length} entries, ${winners.length} winners, prize: ${g.prize}`,
      },
    });

    const winnerRows = await prisma.user.findMany({
      where: { id: { in: winners } },
      select: { id: true, email: true },
    });
    const nameOf = new Map(winnerRows.map((u) => [u.id, u.email.split('@')[0] ?? u.email]));

    return NextResponse.json({
      ok: true,
      giveaway: updated,
      entries: g.entries.length,
      overflow,
      winners: winners.map((wid) => ({ id: wid, name: nameOf.get(wid) ?? 'participant' })),
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

/** GET the giveaways for a session, with entry counts and winners. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await prisma.giveaway.findMany({
    where: { sessionId: id },
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({
    giveaways: rows.map((g) => ({
      id: g.id,
      prize: g.prize,
      rules: g.rules,
      open: g.open,
      entries: g._count.entries,
      winners: g.winners ? (JSON.parse(g.winners) as string[]) : [],
      drawnAt: g.drawnAt,
    })),
  });
}