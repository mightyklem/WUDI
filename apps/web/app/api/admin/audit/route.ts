import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/audit?take=50 — every admin/moderator action, newest first (FR-12.9).
export async function GET(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const take = Math.min(Math.max(Number(searchParams.get('take')) || 50, 1), 200);
  const log = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' }, take,
    include: { actor: { select: { email: true } } },
  });
  return NextResponse.json({ audit: log });
}
