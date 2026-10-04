import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/certificates/[id]/revoke { reason } — trainer of the training only (FR-8.7).
// Revoked numbers stay resolvable and show as revoked (never deleted).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
  const cert = await prisma.certificate.findUnique({
    where: { id }, include: { training: true },
  });
  if (!cert || cert.training.trainerId !== actorId) {
    return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 });
  }
  await prisma.certificate.update({
    where: { id },
    data: { status: 'revoked', revokedReason: (reason || '').slice(0, 300) || null },
  });
  await prisma.auditLog.create({
    data: { actorId, action: 'certificate.revoke', target: `certificate:${cert.number}`, reason: (reason || '').slice(0, 300) || null },
  });
  await prisma.notification.create({
    data: { userId: cert.userId, type: 'certificate-revoked', payload: { number: cert.number } },
  });
  return NextResponse.json({ ok: true });
}
