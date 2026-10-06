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
        ],
      },
    ];
  },
};

export default nextConfig;
