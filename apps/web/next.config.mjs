import { fileURLToPath } from 'url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@learnovize/shared'],
  // fileURLToPath, NOT `new URL(...).pathname`. On Windows `.pathname` yields
  // "/C:/Users/DELL%20PC/..." — a POSIX path with a URL-encoded space. Next.js then
  // derives a bogus relativeAppDir full of "..", which Netlify's Next.js runtime
  // rejects with "publish directory does not contain expected Next.js build output".
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          // The CSP itself is set per-request in middleware.ts, because it carries a
          // nonce that must be new on every document.
          // HSTS is deliberately NOT declared here. It is all-or-nothing per host, so
          // enabling it on a deployment served over plain http -- including localhost
          // -- locks browsers out of the site until the max-age expires, and there is
          // no practical way to undo that from the page. Terminate TLS at the edge and
          // set Strict-Transport-Security in the platform config once every hostname is
          // confirmed to be https.
        ],
      },
    ];
  },
};

export default nextConfig;
