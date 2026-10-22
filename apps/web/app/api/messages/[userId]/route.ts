import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';

const MAX_BODY = 2000;

/**
 * GET /api/messages/[userId] -- the thread with one person.
 *
 * Opening a thread marks what they sent as read. A message that has been seen and not
 * answered is the same as one that has not been seen, as far as the inbox is
 * concerned, and an unread badge that never clears is a badge people learn to ignore.
 */
export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const token = getBearer(req);
  const me = token ? await verifyAccessToken(token) : null;
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId } = await params;
  if (userId === me) return NextResponse.json({ error: 'That is your own profile' }, { status: 400 });

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: me, recipientId: userId },
        { senderId: userId, recipientId: me },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, senderId: true, body: true, readAt: true, createdAt: true },
  });

  await prisma.message.updateMany({
    where: { recipientId: me, senderId: userId, readAt: null },
    data: { readAt: new Date() },
  });

  const other = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, photoUrl: true },
  });

  return NextResponse.json({
    other,
    messages: messages.map((m) => ({
      id: m.id,
      mine: m.senderId === me,
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/messages/[userId] { body } -- reply.
 *
 * The same as sending a message, but to the person whose thread this is.
 */
export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const token = getBearer(req);
  const me = token ? await verifyAccessToken(token) : null;
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId } = await params;
  if (userId === me) return NextResponse.json({ error: 'That is your own profile' }, { status: 400 });

  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  const text = String(body || '').trim();
  if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `Keep it under ${MAX_BODY} characters.` }, { status: 400 });
  }

  const recipient = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, suspended: true, deletedAt: true },
  });
  if (!recipient || recipient.suspended || recipient.deletedAt) {
    return NextResponse.json({ error: 'That person cannot be reached' }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: { senderId: me, recipientId: userId, body: text },
  });

  const sender = await prisma.user.findUnique({
    where: { id: me },
    select: { fullName: true },
  });
  await notify({
    userIds: [userId],
    type: 'message-received',
    payload: { from: sender?.fullName || 'Someone', messageId: message.id, fromUserId: me },
    push: {
      body: `${sender?.fullName || 'Someone'}: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`,
      url: `/messages/${me}`,
    },
  });

  return NextResponse.json({ message }, { status: 201 });
}
