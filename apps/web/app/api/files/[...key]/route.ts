import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { localPathFor } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  json: 'application/json',
};

/**
 * Serves files written by the local disk storage driver (.local-storage/), so
 * uploads work on a dev machine with no S3/R2 credentials.
 *
 * /api/files/<key>              -> .local-storage/public/<key>   (feed media)
 * /api/files/private/<key>      -> .local-storage/private/<key>  (ID documents)
 *
 * Private is served here too so a dev trainer can actually open what they uploaded.
 * It carries no authorisation: that is acceptable only because this route is reachable
 * when isLocalStorage() is true, which is by definition not production. Cloud deployments
 * never touch disk and keep signed, time-limited URLs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  if (!segments?.length) return new NextResponse('Not found', { status: 404 });

  const privateArea = segments[0] === 'private';
  const rest = privateArea ? segments.slice(1) : segments;
  if (!rest.length) return new NextResponse('Not found', { status: 404 });

  const bucket = privateArea ? 'private' : 'public';
  // Rejects any key that resolves outside the storage root, so `../` in a URL cannot
  // walk up to the rest of the filesystem.
  const filePath = localPathFor([bucket, ...rest].join('/'));
  if (!filePath) return new NextResponse('Not found', { status: 404 });

  try {
    const data = await readFile(filePath);
    const ext = rest[rest.length - 1].split('.').pop()?.toLowerCase() || '';
    // Anything not in the allow-list is served as a download rather than rendered, so a
    // file that slips through cannot execute as script in the app's origin.
    const known = TYPES[ext];
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'content-type': known || 'application/octet-stream',
        'content-length': String(data.byteLength),
        'cache-control': privateArea ? 'private, max-age=60' : 'public, max-age=3600',
        ...(known ? {} : { 'content-disposition': 'attachment' }),
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}