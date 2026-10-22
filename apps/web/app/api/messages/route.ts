import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';

const MAX_BODY = 2000;

/**
 * GET /api/messages -- the inbox.
 *
 * One line per person I have spoken to, with their most recent message. A thread is
 * not a separate thing that has to be created: it is the messages between two people,
 * so the inbox is the newest message from each of them and there is no conversation
 * table to keep in step with anything.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [sent, got] = await Promise.all([
    prisma.message.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'desc' },
      select: { recipientId: true, body: true, createdAt: true, readAt: true },
    }),
    prisma.message.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      select: { senderId: true, body: true, createdAt: true, readAt: true },
    }),
  ]);

  // The newest message from each other person wins, whichever way it went.
  const threads = new Map<string, { otherId: string; body: string; at: string; unread: boolean; mine: boolean }>();
  for (const m of sent) {
    threads.set(m.recipientId, {
      otherId: m.recipientId, body: m.body, at: m.createdAt.toISOString(),
      unread: false, mine: true,
    });
  }
  for (const m of got) {
    const existing = threads.get(m.senderId);
    if (!existing || new Date(m.createdAt) > new Date(existing.at)) {
      threads.set(m.senderId, {
        otherId: m.senderId, body: m.body, at: m.createdAt.toISOString(),
        unread: !m.readAt, mine: false,
      });
    }
  }

  const otherIds = [...threads.keys()];
  const people = otherIds.length
    ? await prisma.user.findMany({
        where: { id: { in: otherIds } },
        select: { id: true, fullName: true, photoUrl: true, email: true },
      })
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));

  const list = [...threads.values()]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((t) => {
      const p = byId.get(t.otherId);
      return {
        otherId: t.otherId,
        name: p?.fullName || (p ? p.email.split('@')[0] : 'Someone'),
        photoUrl: p?.photoUrl || null,
        body: t.body,
        at: t.at,
        unread: t.unread,
        mine: t.mine,
      };
    });

  return NextResponse.json({ threads: list, unread: list.filter((t) => t.unread).length });
}

/**
 * POST /api/messages { recipientId, body }
 *
 * Send a message. The recipient gets a push as well as it being in their inbox,
 * because the one time somebody needs to answer a message is usually when they are
 * not in the app.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { recipientId, body } = (await req.json().catch(() => ({}))) as {
    recipientId?: string;
    body?: string;
  };
  const text = String(body || '').trim();
  if (!recipientId) return NextResponse.json({ error: 'Nobody to send it to' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `Keep it under ${MAX_BODY} characters.` }, { status: 400 });
  }
  if (recipientId === userId) {
    return NextResponse.json({ error: 'That is your own profile' }, { status: 400 });
  }

  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true, suspended: true, deletedAt: true, fullName: true },
  });
  if (!recipient || recipient.suspended || recipient.deletedAt) {
    return NextResponse.json({ error: 'That person cannot be reached' }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: { senderId: userId, recipientId, body: text },
  });

  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  const senderName = sender?.fullName || 'Someone';

  await notify({
    userIds: [recipientId],
    type: 'message-received',
    payload: { from: senderName, messageId: message.id, fromUserId: userId },
    // Pushed, not emailed. The line under the title says who, and the push lands on
    // the thread so the answer is one tap away.
    push: {
      body: `${senderName}: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`,
      url: `/messages/${userId}`,
    },
  });

  return NextResponse.json({ message }, { status: 201 });
}
