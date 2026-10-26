import { NextResponse } from 'next/server';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putPublic } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/trainers/[id]/signature
 *
 * Upload a signature image for the trainer's certificate signing.
 * Stored publicly since it appears on certificates.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: trainerId } = await params;

  const trainer = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!trainer) return NextResponse.json({ error: 'Trainer not found' }, { status: 404 });
  if (trainer.userId !== userId) {
    return NextResponse.json({ error: 'Not your profile' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const key = `certificate-signatures/${userId}/${Date.now()}.${ext}`;
  const body = new Uint8Array(buffer);
  const url = await putPublic(key, body, file.type);

  await prisma.trainerProfile.update({
    where: { userId },
    data: { signatureUrl: url },
  });

  return NextResponse.json({ signatureUrl: url });
}
