/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@learnovize/shared'],
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;
