import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { putPrivate } from '@/lib/storage';
import { findDuplicateMaterial } from '@/lib/material-settle';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED: Record<string, string[]> = {
  // documents
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'text/plain': ['txt'],
  // audio + video + images
  'audio/mpeg': ['mp3'],
  'audio/mp4': ['m4a'],
  'audio/wav': ['wav'],
  'video/mp4': ['mp4'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

/**
 * POST /api/materials — a trainer uploads a sellable file (multipart: file,
 * title, description?, priceNgn?, rights=yes). Small files only (≤50MB):
 * video and anything bigger go through /upload-url + /complete. Stored
 * PRIVATE: paid files are only served through the download route after a
 * grant, never from a public URL.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const trainer = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!trainer) return NextResponse.json({ error: 'Only trainers can upload materials' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const title = String(form?.get('title') || '').trim().replace(/\s+/g, ' ');
  const description = String(form?.get('description') || '').trim().slice(0, 1000) || null;
  const priceNgn = Math.floor(Number(form?.get('priceNgn') ?? 0));

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }
  if (title.length < 3 || title.length > 140) {
    return NextResponse.json({ error: 'Title needs 3–140 characters' }, { status: 400 });
  }
  if (!Number.isFinite(priceNgn) || priceNgn < 0 || priceNgn > 1000000) {
    return NextResponse.json({ error: 'Price must be 0–1,000,000 naira' }, { status: 400 });
  }
  if (String(form?.get('rights') || '') !== 'yes') {
    return NextResponse.json({ error: 'Confirm you have the rights to sell this file' }, { status: 400 });
  }
  const exts = ALLOWED[file.type];
  if (!exts) {
    return NextResponse.json({ error: `Type ${file.type || 'unknown'} is not allowed` }, { status: 415 });
  }
  if (file.type === 'video/mp4' || file.size > MAX_BYTES) {
    // Video always takes the presigned path (1GB cap, no function body limit);
    // anything else over 50MB does too.
    return NextResponse.json(
      { error: 'Video and files over 50MB use direct upload', directUpload: true },
      { status: 413 },
    );
  }

  const ext = (file.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '');
  const key = `materials/${userId}/${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await putPrivate(key, bytes, file.type);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const dupe = await findDuplicateMaterial(userId, sha256);
  const status = dupe ? 'held' : 'live';
  const material = await prisma.material.create({
    data: {
      trainerId: userId, title, description, fileKey: key,
      mime: file.type, sizeBytes: file.size, priceNgn, status,
      sha256, rightsConfirmedAt: new Date(),
    },
    select: {
      id: true, title: true, description: true, mime: true,
      sizeBytes: true, priceNgn: true, status: true, createdAt: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: userId, action: dupe ? 'material.held-duplicate' : 'material.rights-confirmed',
      target: `material:${material.id}`,
      reason: dupe
        ? `byte-identical to ${dupe.id} (trainer ${dupe.trainerId})`
        : `rights confirmed for "${title}"`,
    },
  });
  return NextResponse.json(
    dupe
      ? { material, note: 'Identical file already on another shelf — held for review.' }
      : { material },
    { status: 201 },
  );
}

/**
 * GET /api/materials?trainerId= — live materials for a trainer's profile.
 * Public metadata only: no file key, no download URL. Signed-in callers also
 * get `owned: true` on anything they already hold.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const trainerId = searchParams.get('trainerId') || '';
  if (!trainerId) return NextResponse.json({ error: 'trainerId required' }, { status: 400 });

  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;

  // The owner sees everything except takedowns (including held/uploading, so
  // a held item is visible rather than silently gone); everyone else sees live.
  const mine = userId === trainerId;
  const materials = await prisma.material.findMany({
    where: mine ? { trainerId, status: { not: 'removed' } } : { trainerId, status: 'live' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, description: true, mime: true,
      sizeBytes: true, priceNgn: true, status: true, createdAt: true,
    },
  });

  let owned = new Set<string>();
  if (userId) {
    const rows = await prisma.materialPurchase.findMany({
      where: { userId, materialId: { in: materials.map((m) => m.id) }, status: 'granted' },
      select: { materialId: true },
    });
    owned = new Set(rows.map((r) => r.materialId));
  }

  return NextResponse.json({
    materials: materials.map((m) => ({ ...m, owned: owned.has(m.id) })),
  });
}
