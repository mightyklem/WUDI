/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@wudi/shared'],
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;
