import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyCertificateSignature, signingConfigured } from '@/lib/cert-signing';

export const dynamic = 'force-dynamic';

// GET /api/verify/[number] — public, no auth (FR-8.5).
// Shows name/training/trainer/date only when the participant consented at registration.
// Rate-limiting lands with Phase 10 edge config; misses reveal nothing enumerable.
export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const cert = await prisma.certificate.findUnique({
    where: { number: number.toUpperCase() },
    include: {
      training: { select: { title: true, trainer: { select: { displayName: true } } } },
      user: { select: { email: true } },
    },
  });
  if (!cert) {
    await prisma.verifyVisit.create({ data: { number: number.toUpperCase(), status: 'not-found' } }).catch(() => {});
    return NextResponse.json({ status: 'not-found' });
  }
  if (cert.status === 'revoked') {
    await prisma.verifyVisit.create({ data: { number: cert.number, status: 'revoked' } }).catch(() => {});
    return NextResponse.json({ status: 'revoked', number: cert.number });
  }
  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId: cert.trainingId, userId: cert.userId } },
  });
  await prisma.verifyVisit.create({ data: { number: cert.number, status: 'valid' } }).catch(() => {});
  const showName = reg?.certConsentPublic === true;
  // Checked on the way out, not only at issuance. A signature verified once when it was
  // made and never looked at again is the same decorative field sha256 was -- written,
  // never read, so able to detect nothing. Doing it here means a mismatch is visible to
  // the exact person the verification page exists for.
  const signatureValid =
    Boolean(cert.snapshot) && Boolean(cert.signature)
      ? verifyCertificateSignature(cert.snapshot as string, cert.signature as string)
      : false;
  return NextResponse.json({
    status: 'valid',
    number: cert.number,
    participant: showName ? cert.user.email : null,
    training: cert.training.title,
    trainer: cert.training.trainer.displayName,
    pdfUrl: showName ? `/api/certificates/${cert.number}/download` : null,
    // Enough to answer "what does this actually prove", which the old payload did not:
    // a bare title and a trainer name read as a qualification.
    scope: cert.scopeLabel,
    pctAttended: cert.pctAttended,
    issuedAt: cert.createdAt.toISOString(),
    signing: {
      configured: signingConfigured(),
      valid: signatureValid,
      keyId: cert.keyId,
      templateVersion: cert.templateVersion,
      // Published so anyone can re-check this themselves rather than taking our word for
      // the boolean. The snapshot is exactly the claims printed on the document.
      snapshot: cert.snapshot,
      signature: cert.signature,
      publicKeyUrl: '/api/certificates/signing-key',
    },
  });
}
