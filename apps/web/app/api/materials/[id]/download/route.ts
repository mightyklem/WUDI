import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { getPrivate } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/materials/[id]/download — hand over the file, if allowed.
 *
 * The file lives in the private bucket and this route is the only way to it.
 * Free materials grant on first download; paid ones require a granted
 * purchase. Removed materials stay downloadable to buyers who already hold
 * them — they paid for a file, not for a listing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = material.trainerId === userId;

  // Held (under rights review) and unfinished uploads are invisible to
  // everyone but the owner. Removed items stay downloadable to buyers who
  // already hold them — they paid for a file, not for a listing.
  if ((material.status === 'held' || material.status === 'uploading') && !isOwner) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  let granted = isOwner;

  if (!granted) {
    if (material.priceNgn <= 0 && material.status === 'live') {
      // Free: first download is the grant. One row per buyer per material.
      await prisma.materialPurchase.upsert({
        where: { materialId_userId: { materialId: id, userId } },
        create: { materialId: id, userId, amountNgn: 0, provider: 'none', status: 'granted' },
        update: {},
      });
      granted = true;
    } else {
      const purchase = await prisma.materialPurchase.findUnique({
        where: { materialId_userId: { materialId: id, userId } },
      });
      granted = purchase?.status === 'granted';
    }
  }

  if (!granted) return NextResponse.json({ error: 'Not purchased' }, { status: 403 });

  const bytes = await getPrivate(material.fileKey);
  if (!bytes) {
    console.error(`[material] file missing for ${material.id}`);
    return NextResponse.json({ error: 'The file is unavailable' }, { status: 503 });
  }

  const filename = `${material.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'content-type': material.mime,
      'content-length': String(bytes.byteLength),
      'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-content-type-options': 'nosniff',
    },
  });
}
