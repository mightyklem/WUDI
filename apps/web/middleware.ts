import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge rate limiting (single-instance, in-memory). Tune per route below.
 * Production with multiple instances should move buckets to Redis/Upstash —
 * the limits table stays the same, only the store changes.
 */
const buckets = new Map<string, { count: number; reset: number }>();

const LIMITS: { prefix: string; max: number; windowMs: number }[] = [
  { prefix: '/api/auth/', max: 20, windowMs: 60_000 }, // login/signup/refresh: 20/min/IP
  { prefix: '/api/verify/', max: 60, windowMs: 60_000 }, // public verify: 60/min/IP
  { prefix: '/register', max: 300, windowMs: 60_000 }, // seat claims burst (launch day, shared IPs)
];

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = LIMITS.find((l) => pathname.startsWith(l.prefix) || pathname.endsWith(l.prefix));
  if (!rule) return NextResponse.next();
  const key = `${rule.prefix}:${clientIp(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + rule.windowMs });
    return NextResponse.next();
  }
  bucket.count += 1;
  if (bucket.count > rule.max) {
    return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/auth/:path*', '/api/verify/:path*', '/api/trainings/:id/register'],
};
