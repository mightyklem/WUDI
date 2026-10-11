/**
 * Content-Security-Policy for Learnovize.
 *
 * Built from the running configuration rather than a fixed string, because the hosts the
 * browser must be allowed to reach are the ones in the environment: the LiveKit server
 * and the S3/R2 bucket both change between local, staging and production. A hand-typed
 * allowlist drifts out of step with the deployment and then silently breaks the
 * classroom or the upload, which is worse than having no policy at all.
 *
 * Three deliberate weakenings, all of them because the codebase requires them:
 *
 *   style-src 'unsafe-inline'   React inline styles are used throughout, including
 *                               dynamic values like a progress bar width.
 *
 *   script-src 'unsafe-inline'  This is the one that costs something, and it is not
 *                               incidental. A per-request nonce is the proper fix --
 *                               Next.js picks it up from the CSP header on the request
 *                               and stamps it onto its own hydration scripts. But it only
 *                               does so for pages rendered per request, and 26 of the 33
 *                               pages here are client components that Next prerenders
 *                               regardless of `export const dynamic` (verified: the
 *                               directive is ignored and the route still appears in
 *                               prerender-manifest.json). Their markup is built at build
 *                               time with no nonce in it, and because the CSP spec says
 *                               'unsafe-inline' is disregarded once a nonce is present,
 *                               shipping a nonce policy would have silently blocked the
 *                               hydration scripts on 13 pages -- the site would build
 *                               clean and be broken for everyone.
 *
 *                               Converting those pages to server components would allow
 *                               real nonces. That is a deliberate piece of work, not a
 *                               header change, so until it happens this says plainly
 *                               what it is: external script loading is blocked, inline
 *                               script injection is not.
 *
 *   style-src 'unsafe-inline'   does not permit script execution, so it is the harmless
 *                               half of the two.
 */

/**
 * Middleware runs on the Edge runtime, which has Web Crypto but not Node's `crypto`
 * module. Kept because the nonce work above will need it, and because a CSP built in
 * one place stays consistent if that change is made.
 */
export function newNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function originOf(raw?: string | null) {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Extra origins the browser legitimately needs, derived from env. */
export function cspConnectSources() {
  const out = new Set<string>(["'self'"]);

  // LiveKit: the classroom opens a websocket to whatever server is configured.
  const livekit = originOf(process.env.LIVEKIT_URL);
  if (livekit) {
    out.add(livekit);
    // wss://host and https://host are different origins to the browser, and the client
    // library uses both depending on what it is doing.
    out.add(livekit.replace(/^http/, 'ws'));
  } else {
    // Never block the classroom because an env var is missing on one deploy.
    out.add('wss://*.livekit.cloud');
    out.add('https://*.livekit.cloud');
  }

  // Uploads and private ID documents. S3-compatible, so R2 and MinIO both appear here.
  const s3 = originOf(process.env.S3_ENDPOINT);
  if (s3) out.add(s3);
  else {
    out.add('https://*.r2.cloudflarestorage.com');
    out.add('https://*.amazonaws.com');
    out.add('http://localhost:4566');
  }

  return [...out].join(' ');
}

export function buildCsp(_nonce: string, { dev }: { dev: boolean }) {
  const script = dev
    // React Refresh and the dev overlay need eval. Never in production.
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${script}`,
    // Inline styles are everywhere in this codebase; see the note at the top.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src ${cspConnectSources()}`,
    // Paystack checkout is a redirect, not an embed, so no third-party frame is allowed.
    "frame-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Belt and braces with X-Frame-Options: this one also covers nested frames.
    "frame-ancestors 'none'",
    // Block a compromised page from turning a typed URL into a script.
    dev ? null : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');
}
