import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCsp, newNonce } from '@/lib/csp';

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
  // A 6-digit code is only 1e6 possibilities, so guessing must be slow per IP on top of the
  // per-account attempt cap inside the route.
  { prefix: '/api/auth/verify-email', max: 10, windowMs: 60_000 },
  { prefix: '/api/auth/resend-verification', max: 5, windowMs: 60_000 },
  // ADR-002 promises 5/hr/IP and 3/hr/account for password reset. Per-IP sits here;
  // per-account is enforced in the route, because it needs the resolved userId.
  // Ordering matters: these are checked before the generic /api/auth/ bucket, so the
  // stricter reset limit wins rather than the 20/min one.
  { prefix: '/api/auth/forgot-password', max: 5, windowMs: 3_600_000 },
  { prefix: '/api/auth/reset-password', max: 10, windowMs: 3_600_000 },
];

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isDev = process.env.NODE_ENV !== 'production';

  // Every document request gets a fresh nonce and a CSP built from the running config.
  // A per-request nonce is the whole point: a static one would be readable by any
  // injected markup, which is exactly what it is meant to prevent.
  const nonce = newNonce();
  const csp = buildCsp(nonce, { dev: isDev });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next discovers the nonce from the CSP on the REQUEST, not the response. Setting it
  // only on the response produces a policy that blocks Next's own inline hydration
  // scripts on every statically rendered page, because the markup was already built
  // without a nonce by the time the header is attached.
  requestHeaders.set('Content-Security-Policy', csp);
  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  // Most specific prefix wins, not the first one listed. `/api/auth/forgot-password`
  // also matches `/api/auth/`, so with a plain find() the looser 20/min rule would
  // always shadow the stricter per-route limits below and they would never apply.
  let rule: (typeof LIMITS)[number] | undefined;
  for (const l of LIMITS) {
    if (path.startsWith(l.prefix) || path.endsWith(l.prefix)) {
      if (!rule || l.prefix.length > rule.prefix.length) rule = l;
    }
  }
  if (!rule) return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  const key = `${rule.prefix}:${clientIp(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + rule.windowMs });
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }
  bucket.count += 1;
  if (bucket.count > rule.max) {
    return withCsp(NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 }));
  }
  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: [
    '/api/auth/:path*',
    '/api/verify/:path*',
    '/api/trainings/:id/register',
    // Pages, so documents get a nonce. Static build output and images are excluded --
    // they carry no scripts and would only pay for the middleware to run.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
