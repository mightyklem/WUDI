import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

/**
 * Local disk storage, used when no S3 endpoint is configured outside production.
 *
 * Without this, an unconfigured dev machine builds a real AWS S3 client with dummy
 * credentials ("test"), so every upload fails with an opaque 500 -- a trainer cannot
 * post an e-card and gets told nothing useful. Files land in .local-storage/ and are
 * served by /api/files/[...key]. Production never takes this path: it requires
 * S3_ENDPOINT (R2 or S3) so a missing bucket config fails loudly instead of silently
 * writing to a disk that serves nobody.
 */
const LOCAL_ROOT = path.join(process.cwd(), '.local-storage');

export function isLocalStorage(): boolean {
  return !env('S3_ENDPOINT') && process.env.NODE_ENV !== 'production';
}

/** S3-compatible client: local disk in dev, R2/S3 in cloud. */
export function storage(): S3Client {
  return new S3Client({
    region: env('S3_REGION', 'us-east-1'),
    endpoint: env('S3_ENDPOINT') || undefined,
    forcePathStyle: env('S3_FORCE_PATH_STYLE', 'false') === 'true',
    credentials: {
      accessKeyId: env('S3_ACCESS_KEY', 'test'),
      secretAccessKey: env('S3_SECRET_KEY', 'test'),
    },
  });
}

export function localRoot(): string {
  return LOCAL_ROOT;
}

export function publicBucket(): string {
  return env('S3_PUBLIC_BUCKET', 'learnovize-public');
}

/** Public URL for an object in the public bucket (CDN origin in cloud). */
export function publicUrl(key: string): string {
  if (isLocalStorage()) return `/api/files/${key}`;
  const cdn = env('PUBLIC_FILES_BASE', '').replace(/\/$/, '');
  if (cdn) return `${cdn}/${key}`;
  const endpoint = env('S3_ENDPOINT', '').replace(/\/$/, '');
  const bucket = publicBucket();
  if (!endpoint) return `/${bucket}/${key}`;
  if (env('S3_FORCE_PATH_STYLE', 'false') === 'true') return `${endpoint}/${bucket}/${key}`;
  return `${endpoint.replace('https://', `https://${bucket}.`)}/${key}`;
}

export function privateBucket(): string {
  return env('S3_PRIVATE_BUCKET', 'learnovize-private');
}

/**
 * Resolve a key to a path inside the local root, refusing anything that escapes it.
 * A key arrives from the upload route and, for reads, from the URL -- so `../` in a
 * request must not be able to reach the rest of the disk.
 */
export function localPathFor(key: string): string | null {
  const resolved = path.resolve(LOCAL_ROOT, key);
  const root = path.resolve(LOCAL_ROOT);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

async function putLocal(bucket: string, key: string, body: Uint8Array): Promise<string> {
  const target = localPathFor(path.posix.join(bucket, key));
  if (!target) throw new Error('Invalid storage key');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  return target;
}

/** Private upload (trainer ID docs, approval evidence). Never publicly readable. */
export async function putPrivate(key: string, body: Uint8Array, contentType: string): Promise<string> {
  if (isLocalStorage()) {
    await putLocal('private', key, body);
    return key;
  }
  await storage().send(
    new PutObjectCommand({ Bucket: privateBucket(), Key: key, Body: body, ContentType: contentType }),
  );
  return key;
}

/** 5-minute signed read URL for private objects (access is logged by callers). */
export async function signPrivate(key: string, seconds = 300): Promise<string> {
  if (isLocalStorage()) return `/api/files/private/${key}`;
  return getSignedUrl(
    storage(),
    new GetObjectCommand({ Bucket: privateBucket(), Key: key }),
    { expiresIn: seconds },
  );
}

/** Immutable upload — keys contain unique ids, never overwritten. */
export async function putPublic(key: string, body: Uint8Array, contentType: string): Promise<string> {
  if (isLocalStorage()) {
    await putLocal('public', key, body);
    return publicUrl(key);
  }
  await storage().send(
    new PutObjectCommand({ Bucket: publicBucket(), Key: key, Body: body, ContentType: contentType }),
  );
  return publicUrl(key);
}
