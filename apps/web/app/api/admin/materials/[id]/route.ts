import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/materials/[id] { action: release|remove } — resolve a held
 * material. Release puts a cleared file back on sale; remove takes down a
 * confirmed infringement (buyers who already hold it keep their copy, same as
 * a trainer takedown). Repeat infringers are suspended via the existing admin
 * suspend route — the report history on this target is the evidence.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== 'release' && action !== 'remove') {
    return NextResponse.json({ error: 'action must be release|remove' }, { status: 400 });
  }

  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$transaction([
    prisma.material.update({
      where: { id },
      data: { status: action === 'release' ? 'live' : 'removed' },
    }),
    prisma.auditLog.create({
      data: {
        actorId, action: `material.admin-${action}`,
        target: `material:${id}`, reason: `reviewed after reports (${material.reportsCount})`,
      },
    }),
  ]);
  return NextResponse.json({ ok: true, status: action === 'release' ? 'live' : 'removed' });
}
