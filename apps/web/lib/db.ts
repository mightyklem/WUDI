import { PrismaClient } from '../generated/prisma';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Schema lives at repo root ../prisma/schema.prisma; client output defaults to node_modules.
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Preview/draft deploys run without secret env vars (DATABASE_URL included), so any
// Prisma query there throws P1012 and takes the whole page down with a server-side
// exception. Server pages check this and render a graceful fallback instead.
export function dbUnavailable(): boolean {
  return !process.env.DATABASE_URL;
}

// Runs a Prisma read, falling back when the database is not configured (preview
// deploys) or unreachable (transient outage). Never throws.
export async function safeDb<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  if (dbUnavailable()) return fallback;
  try {
    return await run();
  } catch (err) {
    console.error('[db] query failed, serving fallback:', err);
    return fallback;
  }
}
