import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { restoreCertificate } from '@/lib/certs';

export const dynamic = 'force-dynamic';

// POST /api/certificates/[id]/restore { reason } ΓÇö undo a revocation. Same authority as
// the revoke itself, so neither half of the pair is stronger than the other.
//
// This exists because Certificate now carries @@unique([trainingId, userId]). A revoked
// certificate stays on its row forever, so without a way back a revocation made in
// error became permanent and unappealable -- including when the person who made it was
// acting in bad faith, which is the case where undoing it matters most. The alternative,
// a partial unique index scoped to status='valid', would have allowed a brand new
// certificate for someone whose certificate was revoked for fraud.
//
// The stored PDF is untouched, so a restored certificate is byte-identical to the one
// issued and still verifies against the hash recorded then.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
  const why = (reason || '').trim().slice(0, 300) || null;

  const cert = await prisma.certificate.findUnique({
    where: { id }, include: { training: true },
  });
  if (!cert || cert.training.trainerId !== actorId) {
    return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 });
  }
  if (cert.status !== 'revoked') {
    return NextResponse.json({ error: 'That certificate is not revoked' }, { status: 409 });
  }

  const restored = await restoreCertificate(cert.number);
  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'certificate.restore',
      target: `certificate:${cert.number}`,
      // The reason it was originally revoked is worth keeping, so record why it came
      // back rather than letting the history read as if it had never been revoked.
      reason: why || (cert.revokedReason ? `undone ΓÇö was revoked: ${cert.revokedReason}` : 'undone'),
    },
  });
  await prisma.notification.create({
    data: { userId: cert.userId, type: 'certificate-restored', payload: { number: cert.number } },
  });
  return NextResponse.json({ ok: true, status: restored.status });
}
