import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

/**
 * Local disk storage, opt-in via STORAGE_LOCAL=true (ADR-004).
 *
 * ADR-004 specifies S3-compatible storage: s3mock in `docker compose up` locally,
 * R2/S3 in the cloud. That remains the default path.
 *
 * Disk exists only because this machine has no S3 endpoint and Docker is not running,
 * which made every upload fail with an opaque 500. It is deliberately opt-in rather than
 * automatic, so a missing S3_ENDPOINT surfaces as a real error instead of quietly
 * writing uploads to a disk that serves nobody. Production rejects it outright.
 */
const LOCAL_ROOT = path.join(process.cwd(), '.local-storage');

export function isLocalStorage(): boolean {
  const optedIn = (process.env.STORAGE_LOCAL || '').toLowerCase() === 'true';
  if (!optedIn) return false;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('STORAGE_LOCAL must not be enabled in production: uploads need R2/S3.');
  }
  if (env('S3_ENDPOINT')) {
    throw new Error('STORAGE_LOCAL=true conflicts with S3_ENDPOINT. Unset one of them.');
  }
  return true;
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

/**
 * Destroy an object. Used when someone withdraws consent or deletes their account:
 * the ID consent text promises the document can be deleted, and dropping the database
 * row alone would leave the file itself sitting in the bucket forever.
 *
 * Best-effort and never throws — a storage outage must not block an erasure, because a
 * half-finished erasure is worse than one that logs what it could not delete.
 */
export async function removeObject(bucket: 'public' | 'private', key: string): Promise<boolean> {
  try {
    if (isLocalStorage()) {
      const target = localPathFor(path.posix.join(bucket, key));
      if (!target) return false;
      const { unlink } = await import('fs/promises');
      await unlink(target);
      return true;
    }
    const name = bucket === 'public' ? publicBucket() : privateBucket();
    await storage().send(new DeleteObjectCommand({ Bucket: name, Key: key }));
    return true;
  } catch {
    return false;
  }
}
