import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { isLocalStorage, localPathFor } from '@/lib/storage';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

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
 * /api/files/<key>         -> .local-storage/public/<key>   (feed media, public)
 * /api/files/private/<key> -> .local-storage/private/<key>  (ID documents)
 *
 * The private branch holds trainer identity documents, so it is authenticated: the owner
 * of the upload, or an admin reviewing an approval. It used to carry no authorisation at
 * all on the argument that this route is only reachable when local storage is on. That
 * argument does not hold -- the guard is an env-var convention, and a deploy with R2
 * configured and STORAGE_LOCAL unset still mounts the route and still serves private
 * files to anyone who can guess a key. So the check is enforced here regardless, and the
 * whole route 404s when local storage is off, because cloud objects are served by signed
 * URLs from the bucket, never through the app.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  // Not the local driver: nothing here should be reachable at all. Public media and ID
  // documents are served by signed URLs straight from R2/S3.
  if (!isLocalStorage()) return new NextResponse('Not found', { status: 404 });

  const { key: segments } = await params;
  if (!segments?.length) return new NextResponse('Not found', { status: 404 });

  const privateArea = segments[0] === 'private';
  const rest = privateArea ? segments.slice(1) : segments;
  if (!rest.length) return new NextResponse('Not found', { status: 404 });

  if (privateArea) {
    // Identity documents. Require a real session, then only the person who uploaded the
    // file or an admin reviewing an approval may read it.
    const token = getBearer(req);
    const userId = token ? await verifyAccessToken(token) : null;
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    // Uploads are namespaced id/<userId>/... so ownership is checkable from the key.
    // Anything else in the private bucket is refused to everyone, admin included -- an
    // admin has no reason to fetch a document whose owner it cannot establish.
    const owner = /^id\/([^/]+)\//.exec(rest.join('/'))?.[1];
    if (!owner || owner !== userId) {
      if (!(await isAdmin(userId))) return new NextResponse('Forbidden', { status: 403 });
    }
  }

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