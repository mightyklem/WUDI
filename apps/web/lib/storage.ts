import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

/** S3-compatible client: S3Mock locally (path-style), R2/S3 in cloud. */
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

export function publicBucket(): string {
  return env('S3_PUBLIC_BUCKET', 'learnovize-public');
}

/** Public URL for an object in the public bucket (CDN origin in cloud). */
export function publicUrl(key: string): string {
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

/** Private upload (trainer ID docs, approval evidence). Never publicly readable. */
export async function putPrivate(key: string, body: Uint8Array, contentType: string): Promise<string> {
  await storage().send(
    new PutObjectCommand({ Bucket: privateBucket(), Key: key, Body: body, ContentType: contentType }),
  );
  return key;
}

/** 5-minute signed read URL for private objects (access is logged by callers). */
export async function signPrivate(key: string, seconds = 300): Promise<string> {
  return getSignedUrl(
    storage(),
    new GetObjectCommand({ Bucket: privateBucket(), Key: key }),
    { expiresIn: seconds },
  );
}
/** Immutable upload — keys contain unique ids, never overwritten. */
export async function putPublic(key: string, body: Uint8Array, contentType: string): Promise<string> {
  await storage().send(
    new PutObjectCommand({ Bucket: publicBucket(), Key: key, Body: body, ContentType: contentType }),
  );
  return publicUrl(key);
}
