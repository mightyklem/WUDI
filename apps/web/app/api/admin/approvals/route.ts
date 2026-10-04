import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/approvals?status=pending — review queue (staff only)
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const queue = await prisma.trainerApproval.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  return NextResponse.json({ queue });
}
