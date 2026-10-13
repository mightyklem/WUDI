import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
  return NextResponse.json({
    status: 'valid',
    number: cert.number,
    participant: showName ? cert.user.email : null,
    training: cert.training.title,
    trainer: cert.training.trainer.displayName,
    // The document is served by /api/certificates/[number]/download, which re-checks
    // consent and revocation and verifies the hash before returning it. Only advertise
    // it to someone who opted into public display; a link handed to an employer is
    // exactly the case that should work, and handing it to a stranger is exactly the
    // case that should not.
    pdfUrl: showName ? `/api/certificates/${cert.number}/download` : null,
    // Enough to answer "what does this actually prove", which the old payload did not:
    // a bare title and a trainer name read as a qualification.
    scope: cert.scopeLabel,
    pctAttended: cert.pctAttended,
    issuedAt: cert.createdAt.toISOString(),
  });
}
