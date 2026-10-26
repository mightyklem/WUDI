import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
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

/**
 * Read a private object's bytes back.
 *
 * Exists for tamper detection. Certificate PDFs record a SHA-256 at issuance, and a hash
 * that is only ever written and never read cannot detect anything -- an edited or
 * re-uploaded PDF would have looked identical. Callers fetch, hash and compare before
 * handing the bytes to anyone.
 *
 * Returns null when the object is absent rather than throwing, so a caller can tell
 * "deleted" from "access denied" and answer accordingly.
 */
export async function getPrivate(key: string): Promise<Uint8Array | null> {
  if (isLocalStorage()) {
    const target = localPathFor(path.posix.join('private', key));
    if (!target) return null;
    const { readFile } = await import('fs/promises');
    try {
      return new Uint8Array(await readFile(target));
    } catch {
      return null;
    }
  }
  try {
    const res = await storage().send(
      new GetObjectCommand({ Bucket: privateBucket(), Key: key }),
    );
    if (!res.Body) return null;
    return new Uint8Array(await res.Body.transformToByteArray());
  } catch {
    return null;
  }
}

/**
 * Read an object out of the PUBLIC bucket.
 *
 * Only for the one-off migration of already-issued certificates from public to private.
 * It exists so that can be done without hand-writing SDK calls against production
 * credentials, and it should have no long-lived caller: the point of this change is
 * that nothing needs to read from the public bucket afterwards.
 */
export async function getPublicForMigration(key: string): Promise<Uint8Array | null> {
  if (isLocalStorage()) {
    const target = localPathFor(path.posix.join('public', key));
    if (!target) return null;
    const { readFile } = await import('fs/promises');
    try {
      return new Uint8Array(await readFile(target));
    } catch {
      return null;
    }
  }
  try {
    const res = await storage().send(
      new GetObjectCommand({ Bucket: publicBucket(), Key: key }),
    );
    if (!res.Body) return null;
    return new Uint8Array(await res.Body.transformToByteArray());
  } catch (e) {
    // Logged, not swallowed. A bare `catch { return null }` here reported "no object to
    // move" for a certificate whose public URL was demonstrably fetchable, because the
    // real failure was a connection refused against a local MinIO endpoint. Absence and
    // "I could not ask" look identical otherwise, and the caller cannot tell which it got.
    console.error(`[storage] getPublicForMigration(${key}) failed:`, e);
    return null;
  }
}

/**
 * Remove an object from the public bucket.
 *
 * Paired with getPublicForMigration. A copy that stays behind is worse than one that
 * never moved: the whole point is that the derivable URL stops working.
 */
export async function removePublic(key: string): Promise<boolean> {
  if (isLocalStorage()) {
    const target = localPathFor(path.posix.join('public', key));
    if (!target) return false;
    const { unlink } = await import('fs/promises');
    try {
      await unlink(target);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await storage().send(new DeleteObjectCommand({ Bucket: publicBucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
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

/**
 * Presigned PUT URL so a large file (video) uploads straight from the browser
 * to the bucket. The bytes must never pass through a serverless function: the
 * request payload limit (~6MB on Netlify) would reject anything bigger, and
 * buffering a gigabyte in memory would kill the function first.
 *
 * Requires CORS on the bucket: PUT from the app origin (see the upload-url
 * route comment). The server still validates on /complete — a signed URL is
 * permission to send bytes, not proof of what was sent.
 */
export async function presignPrivatePut(key: string, contentType: string, seconds = 900): Promise<string> {
  if (isLocalStorage()) {
    // No HTTP upload target on local disk; the classic multipart route handles it.
    throw new Error('Presigned upload needs S3-compatible storage, not local disk.');
  }
  return getSignedUrl(
    storage(),
    new PutObjectCommand({ Bucket: privateBucket(), Key: key, ContentType: contentType }),
    { expiresIn: seconds },
  );
}

/** Size + type of a private object, without downloading it. */
export async function headPrivate(key: string): Promise<{ size: number; mime: string } | null> {
  if (isLocalStorage()) {
    const target = localPathFor(path.posix.join('private', key));
    if (!target) return null;
    try {
      const { stat } = await import('fs/promises');
      const st = await stat(target);
      // Extension-based type, same mapping as the files route.
      const ext = target.split('.').pop()?.toLowerCase() || '';
      const mime =
        ext === 'mp4' ? 'video/mp4'
        : ext === 'mp3' ? 'audio/mpeg'
        : ext === 'm4a' ? 'audio/mp4'
        : ext === 'wav' ? 'audio/wav'
        : ext === 'pdf' ? 'application/pdf'
        : ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : ext === 'txt' ? 'text/plain'
        : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : 'application/octet-stream';
      return { size: st.size, mime };
    } catch {
      return null;
    }
  }
  try {
    const res = await storage().send(new HeadObjectCommand({ Bucket: privateBucket(), Key: key }));
    return { size: res.ContentLength || 0, mime: res.ContentType || 'application/octet-stream' };
  } catch {
    return null;
  }
}

/**
 * SHA-256 of a private object, streamed so a 1GB video never sits in memory
 * whole. Used to fingerprint materials for duplicate detection.
 */
export async function hashPrivate(key: string): Promise<string | null> {
  try {
    if (isLocalStorage()) {
      const target = localPathFor(path.posix.join('private', key));
      if (!target) return null;
      const { createReadStream } = await import('fs');
      const hash = createHash('sha256');
      await new Promise<void>((resolve, reject) => {
        const s = createReadStream(target);
        s.on('data', (c) => hash.update(c as Buffer));
        s.on('end', () => resolve());
        s.on('error', reject);
      });
      return hash.digest('hex');
    }
    const res = await storage().send(new GetObjectCommand({ Bucket: privateBucket(), Key: key }));
    const body = res.Body as AsyncIterable<Uint8Array> | undefined;
    if (!body) return null;
    const hash = createHash('sha256');
    for await (const chunk of body) hash.update(chunk);
    return hash.digest('hex');
  } catch {
    return null;
  }
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
