import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { hashPrivate, headPrivate } from '@/lib/storage';
import { findDuplicateMaterial } from '@/lib/material-settle';

export const dynamic = 'force-dynamic';

/**
 * POST /api/materials/[id]/complete — finish a presigned upload.
 *
 * Re-checks everything the browser claimed: the object exists, its size fits
 * the cap for its type, and its bytes fingerprint clean. A byte-identical file
 * already shelved by another trainer is held for review rather than listed —
 * that is the re-upload-piracy tripwire. Same-trainer re-uploads pass: a fixed
 * export is not theft.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (material.trainerId !== userId) {
    return NextResponse.json({ error: 'Not your material' }, { status: 403 });
  }
  if (material.status === 'live') return NextResponse.json({ ok: true, status: 'live' });
  if (material.status !== 'uploading') {
    return NextResponse.json({ error: `Cannot complete from ${material.status}` }, { status: 409 });
  }

  const head = await headPrivate(material.fileKey);
  if (!head || head.size === 0) {
    return NextResponse.json({ error: 'Upload not finished — no file found' }, { status: 409 });
  }
  const cap = material.mime === 'video/mp4' ? 1024 * 1024 * 1024 : 50 * 1024 * 1024;
  if (head.size > cap) {
    return NextResponse.json({ error: 'File is over the size limit' }, { status: 413 });
  }

  const sha256 = await hashPrivate(material.fileKey);
  if (!sha256) {
    return NextResponse.json({ error: 'Could not fingerprint the upload' }, { status: 503 });
  }

  const dupe = await findDuplicateMaterial(userId, sha256);
  if (dupe) {
    await prisma.material.update({ where: { id }, data: { status: 'held', sha256, sizeBytes: head.size } });
    await prisma.auditLog.create({
      data: {
        actorId: userId, action: 'material.held-duplicate',
        target: `material:${id}`,
        reason: `byte-identical to ${dupe.id} (trainer ${dupe.trainerId})`,
      },
    });
    return NextResponse.json(
      { ok: true, status: 'held', note: 'Identical file already on another shelf — held for review.' },
      { status: 202 },
    );
  }

  await prisma.material.update({
    where: { id },
    data: { status: 'live', sha256, sizeBytes: head.size },
  });
  return NextResponse.json({ ok: true, status: 'live' });
}
