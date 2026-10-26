import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { presignPrivatePut } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const VIDEO_MAX = 1 * 1024 * 1024 * 1024; // 1GB
const OTHER_MAX = 50 * 1024 * 1024; // 50MB, same as the classic multipart route
const VIDEO_TYPES = ['video/mp4'];
const OTHER_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'audio/mpeg', 'audio/mp4', 'audio/wav',
  'image/jpeg', 'image/png', 'image/webp',
];

/**
 * POST /api/materials/upload-url — mint a presigned PUT for a large (video)
 * upload. JSON: { title, description?, priceNgn?, mime, sizeBytes, rightsConfirmed }.
 *
 * Large files must skip the API route body: serverless functions cap request
 * payloads (~6MB on Netlify), so the browser PUTs straight to the bucket and
 * /complete verifies afterwards. A signed URL is permission to send bytes, not
 * proof of what was sent — size, type and fingerprint are all re-checked there.
 *
 * Bucket CORS must allow PUT from the app origin, or the browser upload fails
 * before it starts. R2/S3: one CORS rule, PUT + Content-Type, app origin.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const trainer = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!trainer) return NextResponse.json({ error: 'Only trainers can upload materials' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string; description?: string; priceNgn?: number;
    mime?: string; sizeBytes?: number; rightsConfirmed?: boolean;
  };
  const title = String(body.title || '').trim().replace(/\s+/g, ' ');
  const description = String(body.description || '').trim().slice(0, 1000) || null;
  const priceNgn = Math.floor(Number(body.priceNgn ?? 0));
  const mime = String(body.mime || '');
  const sizeBytes = Math.floor(Number(body.sizeBytes ?? 0));

  if (title.length < 3 || title.length > 140) {
    return NextResponse.json({ error: 'Title needs 3–140 characters' }, { status: 400 });
  }
  if (!Number.isFinite(priceNgn) || priceNgn < 0 || priceNgn > 1000000) {
    return NextResponse.json({ error: 'Price must be 0–1,000,000 naira' }, { status: 400 });
  }
  // The rights statement is the legal basis for everything downstream (takedown,
  // strikes, suspension). No confirmation, no upload URL.
  if (body.rightsConfirmed !== true) {
    return NextResponse.json({ error: 'Confirm you have the rights to sell this file' }, { status: 400 });
  }

  const isVideo = VIDEO_TYPES.includes(mime);
  const cap = isVideo ? VIDEO_MAX : OTHER_MAX;
  if (!isVideo && !OTHER_TYPES.includes(mime)) {
    return NextResponse.json({ error: `Type ${mime || 'unknown'} is not allowed` }, { status: 415 });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > cap) {
    return NextResponse.json(
      { error: `File must be 1 byte – ${isVideo ? '1GB' : '50MB'}` },
      { status: 413 },
    );
  }

  const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '');
  const key = `materials/${userId}/${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
  let url: string;
  try {
    url = await presignPrivatePut(key, mime);
  } catch (e) {
    // Local disk has no HTTP upload target: fall back to the classic route.
    return NextResponse.json(
      { error: 'Direct upload needs S3-compatible storage', localOnly: true },
      { status: 409 },
    );
  }

  const material = await prisma.material.create({
    data: {
      trainerId: userId, title, description, fileKey: key,
      mime, sizeBytes, priceNgn, status: 'uploading',
      rightsConfirmedAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: {
      actorId: userId, action: 'material.rights-confirmed',
      target: `material:${material.id}`, reason: `rights confirmed for "${title}"`,
    },
  });
  return NextResponse.json({ id: material.id, url, key }, { status: 201 });
}
