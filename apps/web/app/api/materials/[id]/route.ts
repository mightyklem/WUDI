import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/materials/[id] — the owning trainer takes a material down.
 * Purchases already granted keep working: buyers paid for a file, and
 * un-selling what they hold would be the trainer rewriting history.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (material.trainerId !== userId) {
    return NextResponse.json({ error: 'Not your material' }, { status: 403 });
  }
  if (material.status === 'removed') return NextResponse.json({ ok: true });

  await prisma.material.update({ where: { id }, data: { status: 'removed' } });
  return NextResponse.json({ ok: true });
}
