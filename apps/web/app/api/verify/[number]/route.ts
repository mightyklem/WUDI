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
  if (!cert) return NextResponse.json({ status: 'not-found' });
  if (cert.status === 'revoked') {
    return NextResponse.json({ status: 'revoked', number: cert.number });
  }
  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId: cert.trainingId, userId: cert.userId } },
  });
  const showName = reg?.certConsentPublic === true;
  return NextResponse.json({
    status: 'valid',
    number: cert.number,
    participant: showName ? cert.user.email : null,
    training: cert.training.title,
    trainer: cert.training.trainer.displayName,
    pdfUrl: cert.pdfUrl,
  });
}
