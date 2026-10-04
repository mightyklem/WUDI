import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// POST /api/admin/users/[id]/suspend { suspended: boolean, reason? }
// Suspended accounts cannot log in, join rooms, or register (checked at each gate).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const { suspended, reason } = (await req.json().catch(() => ({}))) as {
    suspended?: boolean; reason?: string;
  };
  if (typeof suspended !== 'boolean') {
    return NextResponse.json({ error: 'suspended boolean required' }, { status: 400 });
  }
  if (id === actorId) return NextResponse.json({ error: 'Cannot suspend yourself' }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { suspended } }),
    prisma.auditLog.create({
      data: { actorId, action: suspended ? 'user.suspend' : 'user.unsuspend', target: `user:${id}`, reason: (reason || '').slice(0, 300) || null },
    }),
    prisma.notification.create({
      data: { userId: id, type: suspended ? 'account-suspended' : 'account-restored', payload: { reason: (reason || '').slice(0, 300) || null } },
    }),
  ]);
  // Kill live sessions immediately on suspend.
  if (suspended) {
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  return NextResponse.json({ ok: true, suspended });
}
