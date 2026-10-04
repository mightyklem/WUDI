import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { putPrivate, putPublic } from '@/lib/storage';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const LIMITS: Record<string, { max: number; types: string[]; toPrivate: boolean }> = {
  id: { max: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'application/pdf'], toPrivate: true },
  evidence: { max: 10 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'], toPrivate: true },
  asset: { max: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png'], toPrivate: false },
};

// POST /api/uploads (multipart: file, kind=id|evidence|asset) — authed.
// ID/evidence go to the private bucket (NDPA: approval use only); assets (logos) to public.
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const kind = String(form?.get('kind') || '');
  const rule = LIMITS[kind];
  if (!(file instanceof Blob) || !rule) {
    return NextResponse.json({ error: 'file + kind (id|evidence|asset) required' }, { status: 400 });
  }
  if (file.size > rule.max) return NextResponse.json({ error: `File too large (max ${rule.max / 1048576}MB)` }, { status: 413 });
  if (!rule.types.includes(file.type)) {
    return NextResponse.json({ error: `Type ${file.type || 'unknown'} not allowed` }, { status: 415 });
  }
  const ext = (file.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '');
  const key = `${kind}/${userId}/${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
  const body = new Uint8Array(await file.arrayBuffer());
  if (rule.toPrivate) {
    await putPrivate(key, body, file.type);
    return NextResponse.json({ key }, { status: 201 });
  }
  const url = await putPublic(key, body, file.type);
  return NextResponse.json({ key, url }, { status: 201 });
}
