import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/certificates/mine — my valid certificates with training + trainer.
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const certs = await prisma.certificate.findMany({
    where: { userId, status: 'valid' },
    include: {
      training: { select: { title: true, trainer: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ certificates: certs });
}
