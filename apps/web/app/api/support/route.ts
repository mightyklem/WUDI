import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/support — ask support. Open to everyone, signed in or not: a
 * person locked out of their account is the one who needs support most.
 * Name + a way to reply + the problem, all length-capped. Stored as a ticket
 * for the admin queue rather than emailed — email fails silently, rows don't.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string; contact?: string; topic?: string; message?: string;
  };
  const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const contact = String(body.contact || '').trim().slice(0, 120);
  const topic = String(body.topic || '').trim().slice(0, 60) || 'Something else';
  const message = String(body.message || '').trim().slice(0, 2000);

  if (name.length < 2) return NextResponse.json({ error: 'Tell us your name.' }, { status: 400 });
  if (contact.length < 5) {
    return NextResponse.json({ error: 'Give an email or WhatsApp number we can reply to.' }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: 'Say a little more about what happened (10+ characters).' }, { status: 400 });
  }

  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;

  const ticket = await prisma.supportTicket.create({
    data: { name, contact, topic, message, userId, status: 'open' },
    select: { id: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, ticket }, { status: 201 });
}

/**
 * GET /api/support — the admin queue. Support tickets are answered in the
 * order they arrive, oldest first.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'open';
  const tickets = await prisma.supportTicket.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  return NextResponse.json({ tickets });
}

/**
 * PUT /api/support { id, status } — admin marks a ticket answered|closed|open.
 */
export async function PUT(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id, status } = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!id || !['open', 'answered', 'closed'].includes(status || '')) {
    return NextResponse.json({ error: 'id + status open|answered|closed required' }, { status: 400 });
  }
  await prisma.supportTicket.updateMany({ where: { id }, data: { status: status as string } });
  return NextResponse.json({ ok: true });
}
