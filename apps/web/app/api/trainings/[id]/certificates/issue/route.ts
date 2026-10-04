import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { issueCertificate } from '@/lib/certs';

export const dynamic = 'force-dynamic';

// POST /api/trainings/[id]/certificates/issue { userIds: string[] }
// Trainer only. Each recipient re-validated; ineligible are rejected per-user (FR-8.2).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const t = await prisma.training.findUnique({ where: { id } });
  if (!t || t.trainerId !== actorId) {
    return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 });
  }
  const { userIds } = (await req.json().catch(() => ({}))) as { userIds?: string[] };
  if (!Array.isArray(userIds) || userIds.length < 1 || userIds.length > 500) {
    return NextResponse.json({ error: 'userIds[1..500] required' }, { status: 400 });
  }
  const issued: { userId: string; number: string }[] = [];
  const rejected: { userId: string; reason: string }[] = [];
  for (const userId of [...new Set(userIds)]) {
    try {
      const cert = await issueCertificate(id, userId);
      issued.push({ userId, number: cert.number });
      await prisma.notification.create({
        data: { userId, type: 'certificate-issued', payload: { trainingId: id, number: cert.number } },
      });
    } catch (e) {
      rejected.push({ userId, reason: e instanceof Error ? e.message : 'Issue failed' });
    }
  }
  return NextResponse.json({ issued, rejected });
}
