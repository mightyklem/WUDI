import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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
  const endpoint = env('S3_ENDPOINT', '').replace(/\/$/, '');
  const bucket = publicBucket();
  if (!endpoint) return `/${bucket}/${key}`;
  if (env('S3_FORCE_PATH_STYLE', 'false') === 'true') return `${endpoint}/${bucket}/${key}`;
  return `${endpoint.replace('https://', `https://${bucket}.`)}/${key}`;
}

/** Immutable upload — keys contain the unique cert number, never overwritten. */
export async function putPublic(key: string, body: Uint8Array, contentType: string): Promise<string> {
  await storage().send(
    new PutObjectCommand({ Bucket: publicBucket(), Key: key, Body: body, ContentType: contentType }),
  );
  return publicUrl(key);
}
